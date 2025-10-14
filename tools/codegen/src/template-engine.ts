import * as ejs from 'ejs';

export interface FileOperations {
  readFile: (path: string) => string;
  writeFile: (path: string, content: string) => void;
  joinPath: (...segments: string[]) => string;
  exists: (path: string) => boolean;
  readDir?: (path: string) => string[];
  isDirectory?: (path: string) => boolean;
}

export interface TemplateOptions {
  templateDir: string;
  outputDir: string;
  data: any;
  fileOperations: FileOperations;
}

export interface TemplateFile {
  fullPath: string;
  relativePath: string;
  outputPath: string;
}

export class TemplateEngine {
  private fileOps: FileOperations;

  constructor(fileOperations: FileOperations) {
    this.fileOps = fileOperations;
  }

  async generateFromTemplate(options: TemplateOptions): Promise<void> {
    const { templateDir, outputDir, data } = options;

    if (!this.fileOps.exists(templateDir)) {
      throw new Error(`Template directory not found: ${templateDir}`);
    }

    // Find all template files
    const templateFiles = this.findTemplateFiles(templateDir, '');

    if (templateFiles.length === 0) {
      throw new Error(`No template files found in: ${templateDir}`);
    }

    // Process each template file
    for (const templateFile of templateFiles) {
      await this.processTemplateFile(templateFile, outputDir, data);
    }
  }

  private findTemplateFiles(baseDir: string, relativePath: string): TemplateFile[] {
    const files: TemplateFile[] = [];
    const currentDir = this.fileOps.joinPath(baseDir, relativePath);

    if (!this.fileOps.exists(currentDir)) {
      return files;
    }

    // If we have readDir and isDirectory, use them for proper directory traversal
    if (this.fileOps.readDir && this.fileOps.isDirectory) {
      try {
        const entries = this.fileOps.readDir(currentDir);

        for (const entry of entries) {
          const entryPath = this.fileOps.joinPath(currentDir, entry);
          const entryRelativePath = relativePath ? this.fileOps.joinPath(relativePath, entry) : entry;

          if (this.fileOps.isDirectory(entryPath)) {
            // Recursively process subdirectories
            files.push(...this.findTemplateFiles(baseDir, entryRelativePath));
          } else if (this.isTemplateFile(entry)) {
            files.push({
              fullPath: entryPath,
              relativePath: entryRelativePath,
              outputPath: this.getOutputPath(entryRelativePath),
            });
          }
        }
      } catch (error) {
        console.warn(`Could not read directory ${currentDir}:`, error);
      }
    } else {
      // Fallback: check for common template file patterns
      const commonFiles = [
        'index.ts.ejs',
        'index.ts',
        '__name__.ts.ejs',
        '__name__.ts',
        '__projectName__.ts.ejs',
        '__projectName__.ts',
        'template.ts.ejs',
        'template.ts',
      ];

      for (const fileName of commonFiles) {
        const fullPath = this.fileOps.joinPath(currentDir, fileName);
        if (this.fileOps.exists(fullPath)) {
          const fileRelativePath = relativePath ? this.fileOps.joinPath(relativePath, fileName) : fileName;
          files.push({
            fullPath,
            relativePath: fileRelativePath,
            outputPath: this.getOutputPath(fileRelativePath),
          });
        }
      }
    }

    return files;
  }

  private isTemplateFile(fileName: string): boolean {
    // Consider files as templates if they:
    // 1. Have .ejs extension
    // 2. Are common code file extensions (.ts, .js, .json, etc.)
    // 3. Contain template variables in filename
    const templateExtensions = ['.ejs', '.ts', '.js', '.json', '.md', '.txt', '.html'];
    const hasTemplateExtension = templateExtensions.some(ext => fileName.endsWith(ext));
    const hasTemplateVariables = fileName.includes('__') || fileName.includes('<%');

    return hasTemplateExtension || hasTemplateVariables;
  }

  private getOutputPath(relativePath: string): string {
    let outputPath = relativePath;

    // extension should be always .ts
    // if ends with .template, just remove it

    if (outputPath.endsWith('.template')) {
      outputPath = outputPath.slice(0, -'.template'.length);
    }

    return outputPath;
  }

  private async processTemplateFile(templateFile: TemplateFile, outputDir: string, data: any): Promise<void> {
    try {
      // Read template content
      const templateContent = this.fileOps.readFile(templateFile.fullPath);

      // Process filename with template variables
      let outputFileName = templateFile.outputPath;
      if (outputFileName.includes('__') || outputFileName.includes('<%')) {
        outputFileName = this.processFileName(outputFileName, data);
      }

      // Render template content
      const renderedContent = ejs.render(templateContent, data, {
        filename: templateFile.fullPath,
        rmWhitespace: false,
        delimiter: '%',
      });

      // Write output file
      const outputPath = this.fileOps.joinPath(outputDir, outputFileName);
      this.fileOps.writeFile(outputPath, renderedContent);

      console.log(`Generated: ${outputFileName}`);

    } catch (error) {
      throw new Error(`Failed to process template ${templateFile.relativePath}: ${error instanceof Error ? error.message : error}`);
    }
  }

  private processFileName(fileName: string, data: any): string {
    let result = fileName;

    // Handle __variable__ pattern
    result = result.replace(/__(\w+)__/g, (match, varName) => {
      return data[varName] || match;
    });

    // Handle EJS pattern <%= variable %>
    if (result.includes('<%')) {
      try {
        result = ejs.render(result, data, { delimiter: '%' });
      } catch (error) {
        console.warn(`Could not process filename template: ${fileName}`, error);
      }
    }

    return result;
  }
}

// Helper function for easier usage
export function generateFromTemplate(options: TemplateOptions): Promise<void> {
  const engine = new TemplateEngine(options.fileOperations);
  return engine.generateFromTemplate(options);
}
