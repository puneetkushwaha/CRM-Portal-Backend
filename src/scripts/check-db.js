// src/scripts/check-db.js
const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/User');

async function checkDatabase() {
    try {
        console.log('🔄 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/employee_crm_portal');
        console.log('✅ Connected successfully!\n');

        const userCount = await User.countDocuments();
        console.log(`📊 Total Users in Database: ${userCount}`);

        const users = await User.find().select('fullName email role companyId createdAt').limit(10);

        if (users.length > 0) {
            console.log('\n📝 Last 10 Users:');
            console.table(users.map(u => ({
                Name: u.fullName || u.name,
                Email: u.email,
                Role: u.role,
                RoleType: typeof u.role,
                RoleLen: u.role ? u.role.length : 0,
                Company: u.companyId
            })));
        } else {
            console.log('⚠️ No users found in the database yet.');
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error connecting to database:', error);
        process.exit(1);
    }
}

checkDatabase();
