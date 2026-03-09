const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const WorkReport = require('../models/WorkReport');

// @desc    Export data
// @route   POST /api/admin/export
exports.exportData = async (req, res) => {
  try {
    const { type, format, filters = {} } = req.body;

    // Validate
    const validTypes = ['users', 'attendance', 'reports'];
    const validFormats = ['excel', 'pdf'];

    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid export type'
      });
    }

    if (!validFormats.includes(format)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid format'
      });
    }

    let data;
    let filename;

    // Fetch data
    switch (type) {
      case 'users':
        data = await getExportUsers(filters);
        filename = `employees_${Date.now()}`;
        break;
      case 'attendance':
        data = await getExportAttendance(filters);
        filename = `attendance_${Date.now()}`;
        break;
      case 'reports':
        data = await getExportReports(filters);
        filename = `work_reports_${Date.now()}`;
        break;
    }

    // Generate export
    if (format === 'excel') {
      await exportToExcel(res, type, data, filename);
    } else {
      await exportToPDF(res, type, data, filename);
    }
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({
      success: false,
      message: 'Error exporting data',
      error: error.message
    });
  }
};

// Get users for export
async function getExportUsers(filters) {
  const query = { role: { $ne: 'ADMIN' } };
  if (filters.department) query.department = filters.department;
  if (filters.status) query.isActive = filters.status === 'active';

  return await User.find(query)
    .select('fullName email role department designation mobile isActive createdAt')
    .sort({ fullName: 1 })
    .lean();
}

// Get attendance for export
async function getExportAttendance(filters) {
  const query = {};

  if (filters.startDate || filters.endDate) {
    query.date = {};
    if (filters.startDate) query.date.$gte = new Date(filters.startDate);
    if (filters.endDate) query.date.$lte = new Date(filters.endDate);
  }

  if (filters.status) query.status = filters.status;

  return await Attendance.find(query)
    .populate('user', 'fullName email department')
    .sort({ date: -1 })
    .lean();
}

// Get reports for export
async function getExportReports(filters) {
  const query = {};

  if (filters.startDate || filters.endDate) {
    query.date = {};
    if (filters.startDate) query.date.$gte = new Date(filters.startDate);
    if (filters.endDate) query.date.$lte = new Date(filters.endDate);
  }

  if (filters.status) query.status = filters.status;

  return await WorkReport.find(query)
    .populate('user', 'fullName email department')
    .sort({ date: -1 })
    .lean();
}

// Export to Excel
async function exportToExcel(res, type, data, filename) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(type.charAt(0).toUpperCase() + type.slice(1));

  // Header style
  const headerStyle = {
    font: { bold: true, color: { argb: 'FFFFFF' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: '4472C4' } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    }
  };

  switch (type) {
    case 'users':
      worksheet.columns = [
        { header: 'Name', key: 'fullName', width: 25 },
        { header: 'Email', key: 'email', width: 30 },
        { header: 'Role', key: 'role', width: 15 },
        { header: 'Department', key: 'department', width: 20 },
        { header: 'Designation', key: 'designation', width: 20 },
        { header: 'Mobile', key: 'mobile', width: 15 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Joined', key: 'createdAt', width: 15 }
      ];

      data.forEach(user => {
        worksheet.addRow({
          fullName: user.fullName || '-',
          email: user.email,
          role: user.role,
          department: user.department || '-',
          designation: user.designation || '-',
          mobile: user.mobile || '-',
          status: user.isActive ? 'Active' : 'Disabled',
          createdAt: user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '-'
        });
      });
      break;

    case 'attendance':
      worksheet.columns = [
        { header: 'Employee', key: 'employee', width: 25 },
        { header: 'Email', key: 'email', width: 30 },
        { header: 'Date', key: 'date', width: 15 },
        { header: 'Check In', key: 'checkIn', width: 12 },
        { header: 'Check Out', key: 'checkOut', width: 12 },
        { header: 'Work Hours', key: 'workHours', width: 12 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'In Office', key: 'inOffice', width: 12 }
      ];

      data.forEach(record => {
        worksheet.addRow({
          employee: record.user?.fullName || 'Unknown',
          email: record.user?.email || '-',
          date: record.date ? new Date(record.date).toLocaleDateString() : '-',
          checkIn: record.checkIn?.time ? new Date(record.checkIn.time).toLocaleTimeString() : '-',
          checkOut: record.checkOut?.time ? new Date(record.checkOut.time).toLocaleTimeString() : '-',
          workHours: record.workHours ? `${Math.floor(record.workHours / 60)}h ${record.workHours % 60}m` : '-',
          status: record.status || '-',
          inOffice: record.checkIn?.isWithinOffice ? 'Yes' : 'No'
        });
      });
      break;

    case 'reports':
      worksheet.columns = [
        { header: 'Employee', key: 'employee', width: 25 },
        { header: 'Email', key: 'email', width: 30 },
        { header: 'Date', key: 'date', width: 15 },
        { header: 'Tasks', key: 'tasks', width: 10 },
        { header: 'Hours', key: 'hours', width: 10 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Summary', key: 'summary', width: 40 }
      ];

      data.forEach(report => {
        worksheet.addRow({
          employee: report.user?.fullName || 'Unknown',
          email: report.user?.email || '-',
          date: report.date ? new Date(report.date).toLocaleDateString() : '-',
          tasks: report.tasks?.length || 0,
          hours: report.totalHoursWorked || 0,
          status: report.status || '-',
          summary: report.summary || '-'
        });
      });
      break;
  }

  // Apply header style
  worksheet.getRow(1).eachCell((cell) => {
    cell.style = headerStyle;
  });

  // Set response headers
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename=${filename}.xlsx`
  );

  await workbook.xlsx.write(res);
  res.end();
}

// Export to PDF
async function exportToPDF(res, type, data, filename) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}.pdf`);

  doc.pipe(res);

  // Title
  doc.fontSize(20).font('Helvetica-Bold')
    .text(`${type.charAt(0).toUpperCase() + type.slice(1)} Report`, { align: 'center' });

  doc.moveDown();
  doc.fontSize(10).font('Helvetica')
    .text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
  doc.moveDown(2);

  // Content
  doc.fontSize(10);

  switch (type) {
    case 'users':
      data.forEach((user, index) => {
        if (doc.y > 700) doc.addPage();
        doc.font('Helvetica-Bold').text(`${index + 1}. ${user.fullName || 'Unknown'}`);
        doc.font('Helvetica')
          .text(`   Email: ${user.email}`)
          .text(`   Role: ${user.role}`)
          .text(`   Department: ${user.department || '-'}`)
          .text(`   Status: ${user.isActive ? 'Active' : 'Disabled'}`);
        doc.moveDown(0.5);
      });
      break;

    case 'attendance':
      data.forEach((record, index) => {
        if (doc.y > 700) doc.addPage();
        doc.font('Helvetica-Bold').text(`${index + 1}. ${record.user?.fullName || 'Unknown'}`);
        doc.font('Helvetica')
          .text(`   Date: ${record.date ? new Date(record.date).toLocaleDateString() : '-'}`)
          .text(`   Check In: ${record.checkIn?.time ? new Date(record.checkIn.time).toLocaleTimeString() : '-'}`)
          .text(`   Check Out: ${record.checkOut?.time ? new Date(record.checkOut.time).toLocaleTimeString() : '-'}`)
          .text(`   Status: ${record.status || '-'}`);
        doc.moveDown(0.5);
      });
      break;

    case 'reports':
      data.forEach((report, index) => {
        if (doc.y > 700) doc.addPage();
        doc.font('Helvetica-Bold').text(`${index + 1}. ${report.user?.fullName || 'Unknown'}`);
        doc.font('Helvetica')
          .text(`   Date: ${report.date ? new Date(report.date).toLocaleDateString() : '-'}`)
          .text(`   Tasks: ${report.tasks?.length || 0}`)
          .text(`   Hours: ${report.totalHoursWorked || 0}h`)
          .text(`   Status: ${report.status || '-'}`);
        doc.moveDown(0.5);
      });
      break;
  }

  // Footer
  doc.moveDown(2);
  doc.fontSize(8).text(`Total Records: ${data.length}`, { align: 'right' });

  doc.end();
}