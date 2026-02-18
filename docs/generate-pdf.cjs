const fs = require('fs');
const path = require('path');

// Read markdown
const md = fs.readFileSync(path.join(__dirname, 'TRADER_MANUAL.md'), 'utf8');

// Simple markdown to HTML conversion
function mdToHtml(markdown) {
  return markdown
    // Headers
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // Blockquotes
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    // Tables
    .replace(/\|(.+)\|/g, (match, content) => {
      const cells = content.split('|').map(c => c.trim());
      if (cells.every(c => c.match(/^[-:]+$/))) return ''; // Skip separator
      const tag = cells[0].match(/^[-:]+$/) ? 'th' : 'td';
      return '<tr>' + cells.map(c => `<${tag}>${c}</${tag}>`).join('') + '</tr>';
    })
    // Horizontal rules
    .replace(/^---$/gm, '<hr>')
    // Line breaks for paragraphs
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
}

const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Pay2X Trader Manual</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    
    * { box-sizing: border-box; }
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
      color: #1e293b;
      background: #fff;
    }
    
    h1 {
      color: #059669;
      font-size: 2.5em;
      border-bottom: 3px solid #059669;
      padding-bottom: 10px;
      margin-top: 40px;
    }
    
    h1:first-of-type {
      text-align: center;
      margin-top: 0;
    }
    
    h2 {
      color: #0f766e;
      font-size: 1.5em;
      margin-top: 30px;
      border-left: 4px solid #059669;
      padding-left: 12px;
    }
    
    h3 {
      color: #334155;
      font-size: 1.2em;
      margin-top: 20px;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0;
      font-size: 0.9em;
    }
    
    th, td {
      border: 1px solid #e2e8f0;
      padding: 10px 12px;
      text-align: left;
    }
    
    th {
      background: #f1f5f9;
      font-weight: 600;
    }
    
    tr:nth-child(even) {
      background: #f8fafc;
    }
    
    code {
      background: #f1f5f9;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.9em;
    }
    
    blockquote {
      background: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 12px 16px;
      margin: 15px 0;
      border-radius: 0 8px 8px 0;
    }
    
    blockquote:has(> *:first-child:contains("✅")) {
      background: #dcfce7;
      border-left-color: #22c55e;
    }
    
    hr {
      border: none;
      border-top: 2px solid #e2e8f0;
      margin: 30px 0;
    }
    
    strong {
      color: #0f172a;
    }
    
    .page-break {
      page-break-after: always;
    }
    
    @media print {
      body { padding: 20px; }
      h1 { page-break-before: always; }
      h1:first-of-type { page-break-before: avoid; }
    }
  </style>
</head>
<body>
  ${mdToHtml(md)}
</body>
</html>`;

fs.writeFileSync(path.join(__dirname, 'TRADER_MANUAL.html'), html);
console.log('✓ Generated TRADER_MANUAL.html');
console.log('  Open in browser and use Print → Save as PDF');
