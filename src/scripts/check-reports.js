const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const User = require('../models/User');

const checkReports = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        const interns = await User.find({ role: 'INTERN' }).lean();

        console.log(`Count: ${interns.length}`);

        for (let i = 0; i < interns.length; i++) {
            const intern = interns[i];
            const email = intern.email || 'No Email';
            const weekly = intern.internDetails?.academicWork?.weeklyProgressReport?.length || 0;
            console.log(`[${i}] ${email} - Weekly: ${weekly}`);
        }

    } catch (error) {
        console.error(error);
    } finally {
        await mongoose.disconnect();
    }
};

checkReports();
