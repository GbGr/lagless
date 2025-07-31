import { Plugin } from 'vite';
import ts from 'typescript';
import path from 'path';

interface LaglessSystemDepsOptions {
  /**
   * The decorator name to look for (default: 'System')
   */
  decoratorName?: string;

  /**
   * The static property name to generate (default: 'deps')
   */
  depsPropertyName?: string;

  /**
   * Whether to enable debug logging (default: false)
   */
  debug?: boolean;

  /**
   * File extensions to process (default: ['.ts', '.tsx'])
   */
  extensions?: string[];
}

/**
 * Vite plugin that:
 * - Finds classes with @ECSSystem() decorator
 * - Extracts constructor parameter types
 * - Adds them as a static deps property
 * - Removes the @ECSSystem() decorator
 */

export function laglessSystemDeps(options: LaglessSystemDepsOptions = {}): Plugin {
  const {
    decoratorName = 'ECSSystem',
    depsPropertyName = 'deps',
    debug = false,
    extensions = ['.ts', '.tsx'],
  } = options;

  return {
    name: 'lagless-system-deps',
    enforce: 'pre',
    apply: () => true,

    async transform(code, id) {
      // Check if this file should be processed
      const ext = path.extname(id);
      if (!extensions.includes(ext)) return;

      // Quick check to avoid unnecessary parsing
      const decoratorPattern = `@${decoratorName}(`;
      if (!code.includes(decoratorPattern)) return;

      try {
        // Parse the source file with proper compiler options
        const compilerOptions: ts.CompilerOptions = {
          target: ts.ScriptTarget.ES2020,
          module: ts.ModuleKind.ESNext,
          experimentalDecorators: true,
          emitDecoratorMetadata: false,
          jsx: ts.JsxEmit.Preserve,
        };

        const sf = ts.createSourceFile(
          id,
          code,
          compilerOptions.target || ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TS
        );

        // Create and apply the transformer
        const transformer = createTransformer(decoratorName, depsPropertyName, debug);
        const transformResult = ts.transform(sf, [transformer], compilerOptions);
        const transformed = transformResult.transformed[0] as ts.SourceFile;

        // Print the transformed code with proper printer options
        const printer = ts.createPrinter({
          newLine: ts.NewLineKind.LineFeed,
          removeComments: false,
          omitTrailingSemicolon: false,
        });

        const newCode = printer.printFile(transformed);

        // Clean up
        transformResult.dispose();

        // Only return if code has actually changed
        if (newCode !== code) {
          if (debug) {
            console.log(`[lagless-system-deps] Transformed ${path.basename(id)}`);
            console.log('Original code:', code);
            console.log('Transformed code:', newCode);
          }

          return {
            code: newCode,
            map: null // Let Vite handle source maps
          };
        } else {
          if (debug) {
            console.log(`[lagless-system-deps] No changes for ${path.basename(id)}`);
          }
          return null;
        }
      } catch (error) {
        console.error(`[lagless-system-deps] Error transforming ${id}:`, error);
        // Return original code on error to avoid breaking the build
        return null;
      }
    }
  };
}

/**
 * Creates a TypeScript transformer that handles System decorators
 */
function createTransformer(
  decoratorName: string,
  depsPropertyName: string,
  debug: boolean
): ts.TransformerFactory<ts.SourceFile> {
  return (context) => {
    const visit: ts.Visitor = (node) => {
      // Check if this is a class with the System decorator
      if (ts.isClassDeclaration(node) && hasDecorator(node, decoratorName)) {
        if (debug) {
          console.log(`[lagless-system-deps] Found class with @${decoratorName}() decorator:`,
            node.name?.text || 'AnonymousClass');
        }

        // Find the constructor
        const ctor = node.members.find(ts.isConstructorDeclaration);
        if (ctor && ctor.parameters.length) {
          // Extract dependencies from constructor parameters
          const deps: ts.Expression[] = [];
          let hasErrors = false;

          for (const param of ctor.parameters) {
            if (!param.type) {
              console.warn(
                `[lagless-system-deps] Parameter without type annotation in ${node.name?.text || 'AnonymousClass'}`
              );
              hasErrors = true;
              continue;
            }

            // Handle different type node kinds
            let typeName: string | undefined;
            if (ts.isTypeReferenceNode(param.type)) {
              typeName = getTypeNameFromNode(param.type.typeName);
            } else if (ts.isIdentifier(param.type)) {
              typeName = param.type.text;
            } else {
              console.warn(
                `[lagless-system-deps] Unsupported parameter type in ${node.name?.text || 'AnonymousClass'}`
              );
              hasErrors = true;
              continue;
            }

            if (!typeName) {
              console.warn(
                `[lagless-system-deps] Could not extract type name from parameter in ${node.name?.text || 'AnonymousClass'}`
              );
              hasErrors = true;
              continue;
            }

            deps.push(ts.factory.createIdentifier(typeName));

            if (debug) {
              console.log(`[lagless-system-deps] Found dependency: ${typeName}`);
            }
          }

          // If we have valid dependencies, create the static property
          if (!hasErrors && deps.length > 0) {
            // Create the static deps property
            const depsProp = ts.factory.createPropertyDeclaration(
              [ts.factory.createToken(ts.SyntaxKind.StaticKeyword)],
              ts.factory.createIdentifier(depsPropertyName),
              undefined,
              undefined,
              ts.factory.createArrayLiteralExpression(deps, false)
            );

            // Check if the deps property already exists
            const existingDeps = node.members.find(member =>
              ts.isPropertyDeclaration(member) &&
              ts.isIdentifier(member.name) &&
              member.name.text === depsPropertyName &&
              member.modifiers?.some(m => m.kind === ts.SyntaxKind.StaticKeyword)
            );

            if (existingDeps) {
              console.warn(
                `[lagless-system-deps] Static ${depsPropertyName} property already exists in ${node.name?.text || 'AnonymousClass'}, skipping`
              );

              // Only strip the decorator
              return stripDecorator(node, decoratorName);
            }

            // Update the class with the new property and without the decorator
            const strippedClass = stripDecorator(node, decoratorName);
            return ts.factory.updateClassDeclaration(
              strippedClass,
              strippedClass.modifiers,
              strippedClass.name,
              strippedClass.typeParameters,
              strippedClass.heritageClauses,
              [...strippedClass.members, depsProp]
            );
          } else {
            // Only strip the decorator if we couldn't add deps
            return stripDecorator(node, decoratorName);
          }
        } else {
          if (debug) {
            console.log(`[lagless-system-deps] No constructor or parameters found in ${node.name?.text || 'AnonymousClass'}`);
          }

          // Just strip the decorator
          return stripDecorator(node, decoratorName);
        }
      }

      // Visit child nodes
      return ts.visitEachChild(node, visit, context);
    };

    return (sourceFile) => ts.visitNode(sourceFile, visit) as ts.SourceFile;
  };
}

/**
 * Checks if a class has the specified decorator
 */
function hasDecorator(cls: ts.ClassDeclaration, decoratorName: string): boolean {
  if (!cls.modifiers) return false;

  return cls.modifiers.some(mod => isTargetDecorator(mod, decoratorName));
}

/**
 * Removes the specified decorator from a class
 */
function stripDecorator(cls: ts.ClassDeclaration, decoratorName: string): ts.ClassDeclaration {
  if (!cls.modifiers) return cls;

  const keptModifiers = cls.modifiers.filter(mod => !isTargetDecorator(mod, decoratorName));

  return ts.factory.updateClassDeclaration(
    cls,
    keptModifiers.length ? keptModifiers : undefined,
    cls.name,
    cls.typeParameters,
    cls.heritageClauses,
    cls.members
  );
}

/**
 * Checks if a modifier is the target decorator
 */
function isTargetDecorator(mod: ts.ModifierLike, decoratorName: string): boolean {
  return (
    ts.isDecorator(mod) &&
    ts.isCallExpression(mod.expression) &&
    ts.isIdentifier(mod.expression.expression) &&
    mod.expression.expression.text === decoratorName
  );
}

/**
 * Extracts the type name from a node, handling qualified names
 */
function getTypeNameFromNode(node: ts.Node): string | undefined {
  if (ts.isIdentifier(node)) {
    return node.text;
  } else if (ts.isQualifiedName(node)) {
    return node.right.text;
  }
  return undefined;
}
