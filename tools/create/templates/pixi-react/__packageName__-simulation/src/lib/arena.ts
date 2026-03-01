<% if (simulationType === 'physics3d') { -%>
export const <%= projectName %>Arena = {
  width: 40,
  depth: 30,
  playerRadius: 0.5,
  moveSpeed: 5.0,
  hashReportInterval: 120,
} as const;
<% } else { -%>
export const <%= projectName %>Arena = {
  width: 800,
  height: 600,
  playerRadius: 20,
  moveSpeed: 3.0,
<% if (simulationType === 'raw') { -%>
  damping: 0.85,
<% } -%>
  hashReportInterval: 120,
} as const;
<% } -%>
