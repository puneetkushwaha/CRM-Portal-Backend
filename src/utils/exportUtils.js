// utils/exportUtils.js
// NEW UTILITY - Export functionality for Excel and PDF

const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

// Generate Excel file
exports.generateExcel = async (data, columns, sheetName) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Admin Dashboard';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName.charAt(0).toUpperCase() + sheetName.slice(1));

  // Style header
  sheet.columns = columns.map(col => ({
    header: col.charAt(0).toUpperCase() + col.slice(1).replace(/([A-Z])/g, ' $1'),
    key: col,
    width: 20
  }));

  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: '4A90D9' } // Light blue theme
  };

  // Add data rows
  data.forEach(item => {
    const row = {};
    columns.forEach(col => {
      row[col] = item[col] ?? '';
    });
    sheet.addRow(row);
  });

  // Add borders
  sheet.eachRow((row, rowNumber) => {
    row.eachCell(cell => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
  });

  return workbook.xlsx.writeBuffer();
};

// Generate PDF file
exports.generatePDF = async (data, columns, title) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fontSize(20).fillColor('#4A90D9').text(
      title.charAt(0).toUpperCase() + title.slice(1) + ' Report',
      { align: 'center' }
    );
    doc.moveDown();
    doc.fontSize(10).fillColor('#666').text(
      `Generated on: ${new Date().toLocaleString()}`,
      { align: 'center' }
    );
    doc.moveDown(2);

    // Table configuration
    const pageWidth = doc.page.width - 60;
    const colWidth = pageWidth / columns.length;
    const startX = 30;
    let y = doc.y;

    // Table header
    doc.fillColor('#4A90D9').rect(startX, y, pageWidth, 25).fill();
    doc.fillColor('#FFFFFF').fontSize(9);
    columns.forEach((col, i) => {
      const headerText = col.charAt(0).toUpperCase() + col.slice(1).replace(/([A-Z])/g, ' $1');
      doc.text(headerText, startX + (i * colWidth) + 5, y + 8, { width: colWidth - 10, align: 'left' });
    });
    y += 25;

    // Table rows
    doc.fillColor('#333333').fontSize(8);
    data.slice(0, 50).forEach((item, rowIndex) => { // Limit to 50 rows for PDF
      if (y > doc.page.height - 50) {
        doc.addPage();
        y = 30;
      }

      // Alternate row background
      if (rowIndex % 2 === 0) {
        doc.fillColor('#F5F9FC').rect(startX, y, pageWidth, 20).fill();
      }

      doc.fillColor('#333333');
      columns.forEach((col, i) => {
        const value = String(item[col] ?? '').substring(0, 25);
        doc.text(value, startX + (i * colWidth) + 5, y + 5, { width: colWidth - 10, align: 'left' });
      });
      y += 20;
    });

    // Footer
    doc.fontSize(8).fillColor('#999')
       .text(`Total Records: ${data.length}`, 30, doc.page.height - 30);

    doc.end();
  });
};