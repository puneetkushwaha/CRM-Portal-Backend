/**
 * CRM Routes
 * Complete CRUD operations for Leads, Deals, Contacts, Activities
 * Role-based access control integrated
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { Lead, Deal, CRMContact, Activity, CRMAccount, Meeting, Call, Product, Quote } = require('../models/crmModels');
const User = require('../models/User');

// Import auth middleware from your existing system
const { protect, authorize } = require('../middleware/authMiddleware');

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Build query based on user role
 * - ADMIN: See all data
 * - MANAGER/HR: See team data
 * - SALES/EMPLOYEE: See only assigned data
 * - SUPPORT/INTERN: Read-only, own data
 */
const buildRoleQuery = async (user, assignedField = 'assignedTo') => {
    const role = user.role?.toUpperCase();

    switch (role) {
        case 'ADMIN':
            return {}; // Admin sees everything

        case 'MANAGER':
        case 'HR':
            // Manager/HR sees their team's data
            const teamMembers = await User.find({
                $or: [
                    { manager: user._id },
                    { department: user.department }
                ]
            }).select('_id');
            const teamIds = [user._id, ...teamMembers.map(m => m._id)];
            return { [assignedField]: { $in: teamIds } };

        case 'EMPLOYEE':
        case 'SALES':
        case 'SUPPORT':
        case 'INTERN':
        default:
            return { [assignedField]: user._id };
    }
};

/**
 * Check if user can modify (write access)
 */
const canWrite = (role) => {
    const writeRoles = ['ADMIN', 'MANAGER', 'HR', 'EMPLOYEE', 'SALES'];
    return writeRoles.includes(role?.toUpperCase());
};

/**
 * Check if user can delete
 */
const canDelete = (role) => {
    const deleteRoles = ['ADMIN', 'MANAGER', 'HR'];
    return deleteRoles.includes(role?.toUpperCase());
};

// ============================================
// DASHBOARD STATS
// ============================================
router.get('/dashboard/stats', protect, async (req, res) => {

    try {
        const userId = req.user._id;
        const role = req.user.role?.toUpperCase();

        let leadQuery = await buildRoleQuery(req.user, 'assignedTo');
        let dealQuery = await buildRoleQuery(req.user, 'owner');

        // Get various stats
        const [
            totalLeads,
            newLeads,
            contactedLeads,
            qualifiedLeads,
            convertedLeads,
            totalDeals,
            openDeals,
            wonDeals,
            lostDeals,
            totalDealValue,
            wonDealValue,
            totalContacts,
            pendingActivities,
            todayActivities,
            overdueActivities
        ] = await Promise.all([
            Lead.countDocuments(leadQuery),
            Lead.countDocuments({ ...leadQuery, status: 'new' }),
            Lead.countDocuments({ ...leadQuery, status: 'contacted' }),
            Lead.countDocuments({ ...leadQuery, status: 'qualified' }),
            Lead.countDocuments({ ...leadQuery, status: 'converted' }),
            Deal.countDocuments(dealQuery),
            Deal.countDocuments({ ...dealQuery, stage: { $nin: ['closed_won', 'closed_lost'] } }),
            Deal.countDocuments({ ...dealQuery, stage: 'closed_won' }),
            Deal.countDocuments({ ...dealQuery, stage: 'closed_lost' }),
            Deal.aggregate([
                { $match: dealQuery },
                { $group: { _id: null, total: { $sum: '$value' } } }
            ]),
            Deal.aggregate([
                { $match: { ...dealQuery, stage: 'closed_won' } },
                { $group: { _id: null, total: { $sum: '$value' } } }
            ]),
            CRMContact.countDocuments(await buildRoleQuery(req.user)),
            Activity.countDocuments({
                assignedTo: userId,
                completed: false,
                dueDate: { $gte: new Date() }
            }),
            Activity.countDocuments({
                assignedTo: userId,
                dueDate: {
                    $gte: new Date().setHours(0, 0, 0, 0),
                    $lt: new Date().setHours(23, 59, 59, 999)
                }
            }),
            Activity.countDocuments({
                assignedTo: userId,
                completed: false,
                dueDate: { $lt: new Date() }
            })
        ]);

        // Get recent leads
        const recentLeads = await Lead.find(leadQuery)
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('assignedTo', 'fullName email');

        // Get deal pipeline
        const pipeline = await Deal.aggregate([
            { $match: dealQuery },
            {
                $group: {
                    _id: '$stage',
                    count: { $sum: 1 },
                    value: { $sum: '$value' }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // Get upcoming activities
        const upcomingActivities = await Activity.find({
            assignedTo: userId,
            completed: false,
            dueDate: { $gte: new Date() }
        })
            .sort({ dueDate: 1 })
            .limit(5)
            .populate('relatedTo');

        // Monthly trends (last 6 months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const monthlyLeads = await Lead.aggregate([
            {
                $match: {
                    ...leadQuery,
                    createdAt: { $gte: sixMonthsAgo }
                }
            },
            {
                $group: {
                    _id: {
                        month: { $month: '$createdAt' },
                        year: { $year: '$createdAt' }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);

        const monthlyDeals = await Deal.aggregate([
            {
                $match: {
                    ...dealQuery,
                    stage: 'closed_won',
                    createdAt: { $gte: sixMonthsAgo }
                }
            },
            {
                $group: {
                    _id: {
                        month: { $month: '$createdAt' },
                        year: { $year: '$createdAt' }
                    },
                    count: { $sum: 1 },
                    value: { $sum: '$value' }
                }
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);

        res.json({
            success: true,
            data: {
                leads: {
                    total: totalLeads,
                    new: newLeads,
                    contacted: contactedLeads,
                    qualified: qualifiedLeads,
                    converted: convertedLeads,
                    conversionRate: totalLeads > 0 ? ((convertedLeads / totalLeads) * 100).toFixed(1) : 0
                },
                deals: {
                    total: totalDeals,
                    open: openDeals,
                    won: wonDeals,
                    lost: lostDeals,
                    totalValue: totalDealValue[0]?.total || 0,
                    wonValue: wonDealValue[0]?.total || 0,
                    winRate: (wonDeals + lostDeals) > 0 ? ((wonDeals / (wonDeals + lostDeals)) * 100).toFixed(1) : 0
                },
                contacts: {
                    total: totalContacts
                },
                activities: {
                    pending: pendingActivities,
                    today: todayActivities,
                    overdue: overdueActivities
                },
                recentLeads,
                pipeline,
                upcomingActivities,
                trends: {
                    leads: monthlyLeads,
                    deals: monthlyDeals
                }
            }
        });
    } catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ============================================
// LEAD ROUTES
// ============================================

// Get all leads with filtering, search, pagination
router.get('/leads', protect, async (req, res) => {
    try {
        const {
            status,
            source,
            priority,
            search,
            page = 1,
            limit = 10,
            sortBy = 'createdAt',
            sortOrder = 'desc',
            startDate,
            endDate
        } = req.query;

        let query = await buildRoleQuery(req.user);

        // Filter by status
        if (status && status !== 'all') {
            query.status = status;
        }

        // Filter by source
        if (source && source !== 'all') {
            query.source = source;
        }

        // Filter by priority
        if (priority && priority !== 'all') {
            query.priority = priority;
        }

        // Date range filter
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        // Search
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { company: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } }
            ];
        }

        // Sort
        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

        const total = await Lead.countDocuments(query);
        const leads = await Lead.find(query)
            .populate('assignedTo', 'fullName email avatar')
            .sort(sortOptions)
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        res.json({
            success: true,
            data: {
                leads,
                pagination: {
                    total,
                    page: parseInt(page),
                    pages: Math.ceil(total / limit),
                    limit: parseInt(limit)
                }
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get single lead
router.get('/leads/:id', protect, async (req, res) => {
    try {
        const lead = await Lead.findById(req.params.id)
            .populate('assignedTo', 'fullName email avatar')
            .populate('convertedToContactId')
            .populate('convertedToDealId');

        if (!lead) {
            return res.status(404).json({
                success: false,
                message: 'Lead not found'
            });
        }

        // Check access
        const role = req.user.role?.toUpperCase();
        if (!['ADMIN', 'MANAGER', 'HR'].includes(role) &&
            lead.assignedTo._id.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to view this lead'
            });
        }

        // Get related activities
        const activities = await Activity.find({
            relatedTo: lead._id,
            relatedModel: 'Lead'
        })
            .sort({ createdAt: -1 })
            .limit(10);

        res.json({
            success: true,
            data: { lead, activities }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Create lead
router.post('/leads', protect, async (req, res) => {
    try {
        if (!canWrite(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to create leads'
            });
        }

        const leadData = {
            ...req.body,
            assignedTo: req.body.assignedTo || req.user._id
        };

        const lead = await Lead.create(leadData);
        const populatedLead = await Lead.findById(lead._id)
            .populate('assignedTo', 'fullName email avatar');

        // Create activity log
        await Activity.create({
            type: 'note',
            title: 'Lead Created',
            description: `Lead "${lead.name}" was created`,
            relatedTo: lead._id,
            relatedModel: 'Lead',
            assignedTo: req.user._id,
            createdBy: req.user._id,
            completed: true,
            completedAt: new Date()
        });

        res.status(201).json({
            success: true,
            data: populatedLead,
            message: 'Lead created successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update lead
router.put('/leads/:id', protect, async (req, res) => {
    try {
        if (!canWrite(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to update leads'
            });
        }

        let lead = await Lead.findById(req.params.id);

        if (!lead) {
            return res.status(404).json({
                success: false,
                message: 'Lead not found'
            });
        }

        // Check authorization
        const role = req.user.role?.toUpperCase();
        if (!['ADMIN', 'MANAGER', 'HR'].includes(role) &&
            lead.assignedTo.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to update this lead'
            });
        }

        // Track status change
        const oldStatus = lead.status;
        const newStatus = req.body.status;

        lead = await Lead.findByIdAndUpdate(
            req.params.id,
            { ...req.body, updatedAt: Date.now() },
            { new: true, runValidators: true }
        ).populate('assignedTo', 'fullName email avatar');

        // Log status change
        if (oldStatus !== newStatus) {
            await Activity.create({
                type: 'note',
                title: 'Status Changed',
                description: `Lead status changed from "${oldStatus}" to "${newStatus}"`,
                relatedTo: lead._id,
                relatedModel: 'Lead',
                assignedTo: req.user._id,
                createdBy: req.user._id,
                completed: true,
                completedAt: new Date()
            });
        }

        res.json({
            success: true,
            data: lead,
            message: 'Lead updated successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete lead
router.delete('/leads/:id', protect, async (req, res) => {
    try {
        if (!canDelete(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to delete leads'
            });
        }

        const lead = await Lead.findById(req.params.id);

        if (!lead) {
            return res.status(404).json({
                success: false,
                message: 'Lead not found'
            });
        }

        // Delete related activities
        await Activity.deleteMany({ relatedTo: lead._id, relatedModel: 'Lead' });

        await Lead.findByIdAndDelete(req.params.id);

        res.json({
            success: true,
            message: 'Lead deleted successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Convert lead to contact + deal
router.post('/leads/:id/convert', protect, async (req, res) => {
    try {
        if (!canWrite(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to convert leads'
            });
        }

        const lead = await Lead.findById(req.params.id);

        if (!lead) {
            return res.status(404).json({
                success: false,
                message: 'Lead not found'
            });
        }

        const { createDeal, dealTitle, dealValue, dealStage } = req.body;

        // Create contact from lead
        const nameParts = lead.name.split(' ');
        const contact = await CRMContact.create({
            firstName: nameParts[0] || lead.name,
            lastName: nameParts.slice(1).join(' ') || '',
            email: lead.email,
            phone: lead.phone,
            company: lead.company,
            position: lead.position,
            assignedTo: lead.assignedTo,
            leadSource: lead.source,
            notes: lead.notes
        });

        let deal = null;
        if (createDeal) {
            deal = await Deal.create({
                title: dealTitle || `Deal from ${lead.name}`,
                value: dealValue || lead.estimatedValue || 0,
                stage: dealStage || 'prospecting',
                owner: lead.assignedTo,
                contact: contact._id,
                lead: lead._id
            });
        }

        // Update lead status
        lead.status = 'converted';
        lead.convertedToContactId = contact._id;
        if (deal) lead.convertedToDealId = deal._id;
        await lead.save();

        // Log conversion
        await Activity.create({
            type: 'note',
            title: 'Lead Converted',
            description: `Lead converted to contact${deal ? ' and deal' : ''}`,
            relatedTo: lead._id,
            relatedModel: 'Lead',
            assignedTo: req.user._id,
            createdBy: req.user._id,
            completed: true,
            completedAt: new Date()
        });

        res.json({
            success: true,
            message: 'Lead converted successfully',
            data: { contact, deal, lead }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Bulk update leads
router.put('/leads/bulk/update', protect, async (req, res) => {
    try {
        if (!canWrite(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to update leads'
            });
        }

        const { ids, updates } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Please provide lead IDs'
            });
        }

        const result = await Lead.updateMany(
            { _id: { $in: ids } },
            { ...updates, updatedAt: Date.now() }
        );

        res.json({
            success: true,
            message: `${result.modifiedCount} leads updated`,
            data: result
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// DEAL ROUTES
// ============================================

// Get all deals
router.get('/deals', protect, async (req, res) => {
    try {
        const {
            stage,
            search,
            page = 1,
            limit = 10,
            sortBy = 'createdAt',
            sortOrder = 'desc',
            minValue,
            maxValue
        } = req.query;

        let query = await buildRoleQuery(req.user, 'owner');

        if (stage && stage !== 'all') {
            query.stage = stage;
        }

        if (minValue || maxValue) {
            query.value = {};
            if (minValue) query.value.$gte = parseFloat(minValue);
            if (maxValue) query.value.$lte = parseFloat(maxValue);
        }

        if (search) {
            query.title = { $regex: search, $options: 'i' };
        }

        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

        const total = await Deal.countDocuments(query);
        const deals = await Deal.find(query)
            .populate('owner', 'fullName email avatar')
            .populate('contact', 'firstName lastName email company')
            .sort(sortOptions)
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        res.json({
            success: true,
            data: {
                deals,
                pagination: {
                    total,
                    page: parseInt(page),
                    pages: Math.ceil(total / limit),
                    limit: parseInt(limit)
                }
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get single deal
router.get('/deals/:id', protect, async (req, res) => {
    try {
        const deal = await Deal.findById(req.params.id)
            .populate('owner', 'fullName email avatar')
            .populate('contact', 'firstName lastName email phone company')
            .populate('lead', 'name email');

        if (!deal) {
            return res.status(404).json({
                success: false,
                message: 'Deal not found'
            });
        }

        const role = req.user.role?.toUpperCase();
        if (!['ADMIN', 'MANAGER', 'HR'].includes(role) &&
            deal.owner._id.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to view this deal'
            });
        }

        const activities = await Activity.find({
            relatedTo: deal._id,
            relatedModel: 'Deal'
        })
            .sort({ createdAt: -1 })
            .limit(10);

        res.json({
            success: true,
            data: { deal, activities }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Create deal
router.post('/deals', protect, async (req, res) => {
    try {
        if (!canWrite(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to create deals'
            });
        }

        const dealData = {
            ...req.body,
            owner: req.body.owner || req.user._id
        };

        const deal = await Deal.create(dealData);
        const populatedDeal = await Deal.findById(deal._id)
            .populate('owner', 'fullName email avatar')
            .populate('contact', 'firstName lastName email');

        await Activity.create({
            type: 'note',
            title: 'Deal Created',
            description: `Deal "${deal.title}" worth $${deal.value} was created`,
            relatedTo: deal._id,
            relatedModel: 'Deal',
            assignedTo: req.user._id,
            createdBy: req.user._id,
            completed: true,
            completedAt: new Date()
        });

        res.status(201).json({
            success: true,
            data: populatedDeal,
            message: 'Deal created successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update deal
router.put('/deals/:id', protect, async (req, res) => {
    try {
        if (!canWrite(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to update deals'
            });
        }

        let deal = await Deal.findById(req.params.id);

        if (!deal) {
            return res.status(404).json({
                success: false,
                message: 'Deal not found'
            });
        }

        const role = req.user.role?.toUpperCase();
        if (!['ADMIN', 'MANAGER', 'HR'].includes(role) &&
            deal.owner.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to update this deal'
            });
        }

        const oldStage = deal.stage;
        const newStage = req.body.stage;

        deal = await Deal.findByIdAndUpdate(
            req.params.id,
            { ...req.body, updatedAt: Date.now() },
            { new: true, runValidators: true }
        ).populate('owner', 'fullName email avatar')
            .populate('contact', 'firstName lastName email');

        if (oldStage !== newStage) {
            await Activity.create({
                type: 'note',
                title: 'Stage Changed',
                description: `Deal stage changed from "${oldStage}" to "${newStage}"`,
                relatedTo: deal._id,
                relatedModel: 'Deal',
                assignedTo: req.user._id,
                createdBy: req.user._id,
                completed: true,
                completedAt: new Date()
            });

            // Emit real-time notification if deal won/lost
            if (newStage === 'closed_won' || newStage === 'closed_lost') {
                const io = req.app.get('io');
                if (io) {
                    io.to(deal.owner._id.toString()).emit('dealStatusChange', {
                        dealId: deal._id,
                        title: deal.title,
                        stage: newStage,
                        value: deal.value
                    });
                }
            }
        }

        res.json({
            success: true,
            data: deal,
            message: 'Deal updated successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete deal
router.delete('/deals/:id', protect, async (req, res) => {
    try {
        if (!canDelete(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to delete deals'
            });
        }

        const deal = await Deal.findById(req.params.id);

        if (!deal) {
            return res.status(404).json({
                success: false,
                message: 'Deal not found'
            });
        }

        await Activity.deleteMany({ relatedTo: deal._id, relatedModel: 'Deal' });
        await Deal.findByIdAndDelete(req.params.id);

        res.json({
            success: true,
            message: 'Deal deleted successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get deal pipeline summary
router.get('/deals/pipeline/summary', protect, async (req, res) => {
    try {
        let query = await buildRoleQuery(req.user, 'owner');

        const pipeline = await Deal.aggregate([
            { $match: query },
            {
                $group: {
                    _id: '$stage',
                    count: { $sum: 1 },
                    totalValue: { $sum: '$value' },
                    avgProbability: { $avg: '$probability' }
                }
            },
            {
                $project: {
                    stage: '$_id',
                    count: 1,
                    totalValue: 1,
                    avgProbability: { $round: ['$avgProbability', 1] },
                    weightedValue: {
                        $round: [{ $multiply: ['$totalValue', { $divide: ['$avgProbability', 100] }] }, 2]
                    }
                }
            },
            { $sort: { stage: 1 } }
        ]);

        const stageOrder = ['prospecting', 'qualification', 'needs_analysis', 'proposal', 'negotiation', 'closed_won', 'closed_lost'];
        const sortedPipeline = stageOrder.map(stage =>
            pipeline.find(p => p.stage === stage) || {
                stage,
                count: 0,
                totalValue: 0,
                avgProbability: 0,
                weightedValue: 0
            }
        );

        res.json({
            success: true,
            data: sortedPipeline
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// CONTACT ROUTES
// ============================================

// Get all contacts
router.get('/contacts', protect, async (req, res) => {
    try {
        const {
            search,
            company,
            page = 1,
            limit = 10,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        let query = await buildRoleQuery(req.user);

        if (company) {
            query.company = { $regex: company, $options: 'i' };
        }

        if (search) {
            query.$or = [
                { firstName: { $regex: search, $options: 'i' } },
                { lastName: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { company: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } }
            ];
        }

        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

        const total = await CRMContact.countDocuments(query);
        const contacts = await CRMContact.find(query)
            .populate('assignedTo', 'fullName email avatar')
            .sort(sortOptions)
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        res.json({
            success: true,
            data: {
                contacts,
                pagination: {
                    total,
                    page: parseInt(page),
                    pages: Math.ceil(total / limit),
                    limit: parseInt(limit)
                }
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get single contact
router.get('/contacts/:id', protect, async (req, res) => {
    try {
        const contact = await CRMContact.findById(req.params.id)
            .populate('assignedTo', 'fullName email avatar')
            .populate('accountId', 'name');

        if (!contact) {
            return res.status(404).json({
                success: false,
                message: 'Contact not found'
            });
        }

        // Get related deals
        const deals = await Deal.find({ contact: contact._id })
            .sort({ createdAt: -1 })
            .limit(5);

        // Get related activities
        const activities = await Activity.find({
            relatedTo: contact._id,
            relatedModel: 'CRMContact'
        })
            .sort({ createdAt: -1 })
            .limit(10);

        res.json({
            success: true,
            data: { contact, deals, activities }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Create contact
router.post('/contacts', protect, async (req, res) => {
    try {
        if (!canWrite(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to create contacts'
            });
        }

        const contactData = {
            ...req.body,
            assignedTo: req.body.assignedTo || req.user._id
        };

        const contact = await CRMContact.create(contactData);
        const populatedContact = await CRMContact.findById(contact._id)
            .populate('assignedTo', 'fullName email avatar');

        res.status(201).json({
            success: true,
            data: populatedContact,
            message: 'Contact created successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update contact
router.put('/contacts/:id', protect, async (req, res) => {
    try {
        if (!canWrite(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to update contacts'
            });
        }

        let contact = await CRMContact.findById(req.params.id);

        if (!contact) {
            return res.status(404).json({
                success: false,
                message: 'Contact not found'
            });
        }

        contact = await CRMContact.findByIdAndUpdate(
            req.params.id,
            { ...req.body, updatedAt: Date.now() },
            { new: true, runValidators: true }
        ).populate('assignedTo', 'fullName email avatar');

        res.json({
            success: true,
            data: contact,
            message: 'Contact updated successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete contact
router.delete('/contacts/:id', protect, async (req, res) => {
    try {
        if (!canDelete(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to delete contacts'
            });
        }

        const contact = await CRMContact.findById(req.params.id);

        if (!contact) {
            return res.status(404).json({
                success: false,
                message: 'Contact not found'
            });
        }

        await Activity.deleteMany({ relatedTo: contact._id, relatedModel: 'CRMContact' });
        await CRMContact.findByIdAndDelete(req.params.id);

        res.json({
            success: true,
            message: 'Contact deleted successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ACTIVITY ROUTES
// ============================================

// Get all activities
router.get('/activities', protect, async (req, res) => {
    try {
        const {
            type,
            completed,
            page = 1,
            limit = 20,
            sortBy = 'dueDate',
            sortOrder = 'asc'
        } = req.query;

        let query = { assignedTo: req.user._id };

        if (type && type !== 'all') {
            query.type = type;
        }

        if (completed !== undefined) {
            query.completed = completed === 'true';
        }

        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

        const total = await Activity.countDocuments(query);
        const activities = await Activity.find(query)
            .populate('relatedTo')
            .populate('assignedTo', 'fullName')
            .populate('createdBy', 'fullName')
            .sort(sortOptions)
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        res.json({
            success: true,
            data: {
                activities,
                pagination: {
                    total,
                    page: parseInt(page),
                    pages: Math.ceil(total / limit),
                    limit: parseInt(limit)
                }
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Create activity
router.post('/activities', protect, async (req, res) => {
    try {
        const activityData = {
            ...req.body,
            assignedTo: req.body.assignedTo || req.user._id,
            createdBy: req.user._id
        };

        const activity = await Activity.create(activityData);
        const populatedActivity = await Activity.findById(activity._id)
            .populate('relatedTo')
            .populate('assignedTo', 'fullName');

        res.status(201).json({
            success: true,
            data: populatedActivity,
            message: 'Activity created successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update activity
router.put('/activities/:id', protect, async (req, res) => {
    try {
        let activity = await Activity.findById(req.params.id);

        if (!activity) {
            return res.status(404).json({
                success: false,
                message: 'Activity not found'
            });
        }

        // If completing activity, set completedAt
        if (req.body.completed && !activity.completed) {
            req.body.completedAt = new Date();
        }

        activity = await Activity.findByIdAndUpdate(
            req.params.id,
            { ...req.body, updatedAt: Date.now() },
            { new: true, runValidators: true }
        ).populate('relatedTo')
            .populate('assignedTo', 'fullName');

        res.json({
            success: true,
            data: activity,
            message: 'Activity updated successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete activity
router.delete('/activities/:id', protect, async (req, res) => {
    try {
        const activity = await Activity.findById(req.params.id);

        if (!activity) {
            return res.status(404).json({
                success: false,
                message: 'Activity not found'
            });
        }

        await Activity.findByIdAndDelete(req.params.id);

        res.json({
            success: true,
            message: 'Activity deleted successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Mark activity as complete
router.patch('/activities/:id/complete', protect, async (req, res) => {
    try {
        const activity = await Activity.findByIdAndUpdate(
            req.params.id,
            {
                completed: true,
                completedAt: new Date(),
                outcome: req.body.outcome
            },
            { new: true }
        ).populate('relatedTo');

        if (!activity) {
            return res.status(404).json({
                success: false,
                message: 'Activity not found'
            });
        }

        res.json({
            success: true,
            data: activity,
            message: 'Activity marked as complete'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// MEETING ROUTES
// ============================================

// Get all meetings
router.get('/meetings', protect, async (req, res) => {
    try {
        const {
            status,
            startDate,
            endDate,
            search,
            page = 1,
            limit = 10
        } = req.query;

        let query = { host: req.user._id };

        // Also include meetings where user is a participant
        const role = req.user.role?.toUpperCase();
        if (['ADMIN', 'MANAGER', 'HR'].includes(role)) {
            query = {};
        }

        if (status && status !== 'all') {
            query.status = status;
        }

        if (startDate || endDate) {
            query.startDate = {};
            if (startDate) query.startDate.$gte = new Date(startDate);
            if (endDate) query.startDate.$lte = new Date(endDate);
        }

        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        const total = await Meeting.countDocuments(query);
        const meetings = await Meeting.find(query)
            .populate('host', 'fullName email avatar')
            .populate('participants.user', 'fullName email')
            .populate('relatedTo')
            .sort({ startDate: 1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        res.json({
            success: true,
            data: {
                meetings,
                pagination: {
                    total,
                    page: parseInt(page),
                    pages: Math.ceil(total / limit),
                    limit: parseInt(limit)
                }
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get single meeting
router.get('/meetings/:id', protect, async (req, res) => {
    try {
        const meeting = await Meeting.findById(req.params.id)
            .populate('host', 'fullName email avatar')
            .populate('participants.user', 'fullName email')
            .populate('relatedTo');

        if (!meeting) {
            return res.status(404).json({ success: false, message: 'Meeting not found' });
        }

        res.json({ success: true, data: meeting });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Create meeting
router.post('/meetings', protect, async (req, res) => {
    try {
        if (!canWrite(req.user.role)) {
            return res.status(403).json({ success: false, message: 'Permission denied' });
        }

        const meetingData = {
            ...req.body,
            host: req.body.host || req.user._id
        };

        const meeting = await Meeting.create(meetingData);
        const populatedMeeting = await Meeting.findById(meeting._id)
            .populate('host', 'fullName email avatar')
            .populate('participants.user', 'fullName email');

        res.status(201).json({
            success: true,
            data: populatedMeeting,
            message: 'Meeting scheduled successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update meeting
router.put('/meetings/:id', protect, async (req, res) => {
    try {
        if (!canWrite(req.user.role)) {
            return res.status(403).json({ success: false, message: 'Permission denied' });
        }

        const meeting = await Meeting.findByIdAndUpdate(
            req.params.id,
            { ...req.body, updatedAt: Date.now() },
            { new: true, runValidators: true }
        )
            .populate('host', 'fullName email avatar')
            .populate('participants.user', 'fullName email');

        if (!meeting) {
            return res.status(404).json({ success: false, message: 'Meeting not found' });
        }

        res.json({ success: true, data: meeting, message: 'Meeting updated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete meeting
router.delete('/meetings/:id', protect, async (req, res) => {
    try {
        if (!canDelete(req.user.role)) {
            return res.status(403).json({ success: false, message: 'Permission denied' });
        }

        const meeting = await Meeting.findByIdAndDelete(req.params.id);

        if (!meeting) {
            return res.status(404).json({ success: false, message: 'Meeting not found' });
        }

        res.json({ success: true, message: 'Meeting deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update meeting status
router.patch('/meetings/:id/status', protect, async (req, res) => {
    try {
        const { status, outcome } = req.body;

        const meeting = await Meeting.findByIdAndUpdate(
            req.params.id,
            { status, outcome, updatedAt: Date.now() },
            { new: true }
        );

        if (!meeting) {
            return res.status(404).json({ success: false, message: 'Meeting not found' });
        }

        res.json({ success: true, data: meeting, message: 'Meeting status updated' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get upcoming meetings
router.get('/meetings/upcoming/list', protect, async (req, res) => {
    try {
        const meetings = await Meeting.find({
            $or: [
                { host: req.user._id },
                { 'participants.user': req.user._id }
            ],
            startDate: { $gte: new Date() },
            status: { $in: ['scheduled', 'rescheduled'] }
        })
            .populate('host', 'fullName email')
            .sort({ startDate: 1 })
            .limit(10);

        res.json({ success: true, data: meetings });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// CALL ROUTES
// ============================================

// Get all calls
router.get('/calls', protect, async (req, res) => {
    try {
        const {
            status,
            callType,
            startDate,
            endDate,
            search,
            page = 1,
            limit = 10
        } = req.query;

        let query = await buildRoleQuery(req.user, 'caller');

        if (status && status !== 'all') {
            query.status = status;
        }

        if (callType && callType !== 'all') {
            query.callType = callType;
        }

        if (startDate || endDate) {
            query.startTime = {};
            if (startDate) query.startTime.$gte = new Date(startDate);
            if (endDate) query.startTime.$lte = new Date(endDate);
        }

        if (search) {
            query.$or = [
                { subject: { $regex: search, $options: 'i' } },
                { contactName: { $regex: search, $options: 'i' } },
                { phoneNumber: { $regex: search, $options: 'i' } }
            ];
        }

        const total = await Call.countDocuments(query);
        const calls = await Call.find(query)
            .populate('caller', 'fullName email avatar')
            .populate('relatedTo')
            .sort({ startTime: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        res.json({
            success: true,
            data: {
                calls,
                pagination: {
                    total,
                    page: parseInt(page),
                    pages: Math.ceil(total / limit),
                    limit: parseInt(limit)
                }
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get single call
router.get('/calls/:id', protect, async (req, res) => {
    try {
        const call = await Call.findById(req.params.id)
            .populate('caller', 'fullName email avatar')
            .populate('relatedTo');

        if (!call) {
            return res.status(404).json({ success: false, message: 'Call not found' });
        }

        res.json({ success: true, data: call });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Create call (log a call)
router.post('/calls', protect, async (req, res) => {
    try {
        if (!canWrite(req.user.role)) {
            return res.status(403).json({ success: false, message: 'Permission denied' });
        }

        const callData = {
            ...req.body,
            caller: req.body.caller || req.user._id
        };

        // Calculate duration if both start and end time provided
        if (callData.startTime && callData.endTime) {
            const start = new Date(callData.startTime);
            const end = new Date(callData.endTime);
            callData.duration = Math.floor((end - start) / 1000); // in seconds
        }

        const call = await Call.create(callData);
        const populatedCall = await Call.findById(call._id)
            .populate('caller', 'fullName email avatar')
            .populate('relatedTo');

        res.status(201).json({
            success: true,
            data: populatedCall,
            message: 'Call logged successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update call
router.put('/calls/:id', protect, async (req, res) => {
    try {
        if (!canWrite(req.user.role)) {
            return res.status(403).json({ success: false, message: 'Permission denied' });
        }

        // Recalculate duration if times changed
        if (req.body.startTime && req.body.endTime) {
            const start = new Date(req.body.startTime);
            const end = new Date(req.body.endTime);
            req.body.duration = Math.floor((end - start) / 1000);
        }

        const call = await Call.findByIdAndUpdate(
            req.params.id,
            { ...req.body, updatedAt: Date.now() },
            { new: true, runValidators: true }
        )
            .populate('caller', 'fullName email avatar')
            .populate('relatedTo');

        if (!call) {
            return res.status(404).json({ success: false, message: 'Call not found' });
        }

        res.json({ success: true, data: call, message: 'Call updated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete call
router.delete('/calls/:id', protect, async (req, res) => {
    try {
        if (!canDelete(req.user.role)) {
            return res.status(403).json({ success: false, message: 'Permission denied' });
        }

        const call = await Call.findByIdAndDelete(req.params.id);

        if (!call) {
            return res.status(404).json({ success: false, message: 'Call not found' });
        }

        res.json({ success: true, message: 'Call deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get call stats
router.get('/calls/stats/summary', protect, async (req, res) => {
    try {
        const userId = req.user._id;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const thisWeek = new Date(today);
        thisWeek.setDate(thisWeek.getDate() - 7);

        const [totalCalls, todayCalls, weekCalls, callsByType, callsByResult] = await Promise.all([
            Call.countDocuments({ caller: userId }),
            Call.countDocuments({ caller: userId, startTime: { $gte: today } }),
            Call.countDocuments({ caller: userId, startTime: { $gte: thisWeek } }),
            Call.aggregate([
                { $match: { caller: userId } },
                { $group: { _id: '$callType', count: { $sum: 1 } } }
            ]),
            Call.aggregate([
                { $match: { caller: userId, callResult: { $exists: true } } },
                { $group: { _id: '$callResult', count: { $sum: 1 } } }
            ])
        ]);

        res.json({
            success: true,
            data: {
                totalCalls,
                todayCalls,
                weekCalls,
                callsByType,
                callsByResult
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// PRODUCT ROUTES
// ============================================

// Get all products
router.get('/products', protect, async (req, res) => {
    try {
        const {
            category,
            type,
            isActive,
            search,
            minPrice,
            maxPrice,
            page = 1,
            limit = 10,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        let query = {};

        if (category && category !== 'all') {
            query.category = category;
        }

        if (type && type !== 'all') {
            query.type = type;
        }

        if (isActive !== undefined) {
            query.isActive = isActive === 'true';
        }

        if (minPrice || maxPrice) {
            query.unitPrice = {};
            if (minPrice) query.unitPrice.$gte = parseFloat(minPrice);
            if (maxPrice) query.unitPrice.$lte = parseFloat(maxPrice);
        }

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { code: { $regex: search, $options: 'i' } },
                { sku: { $regex: search, $options: 'i' } }
            ];
        }

        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

        const total = await Product.countDocuments(query);
        const products = await Product.find(query)
            .populate('createdBy', 'fullName email')
            .sort(sortOptions)
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        // Get categories for filter
        const categories = await Product.distinct('category');

        res.json({
            success: true,
            data: {
                products,
                categories: categories.filter(c => c),
                pagination: {
                    total,
                    page: parseInt(page),
                    pages: Math.ceil(total / limit),
                    limit: parseInt(limit)
                }
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get single product
router.get('/products/:id', protect, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id)
            .populate('createdBy', 'fullName email');

        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        res.json({ success: true, data: product });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Create product
router.post('/products', protect, async (req, res) => {
    try {
        const role = req.user.role?.toUpperCase();
        if (!['ADMIN', 'MANAGER', 'HR'].includes(role)) {
            return res.status(403).json({ success: false, message: 'Permission denied' });
        }

        const productData = {
            ...req.body,
            createdBy: req.user._id
        };

        const product = await Product.create(productData);
        const populatedProduct = await Product.findById(product._id)
            .populate('createdBy', 'fullName email');

        res.status(201).json({
            success: true,
            data: populatedProduct,
            message: 'Product created successfully'
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Product code already exists'
            });
        }
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update product
router.put('/products/:id', protect, async (req, res) => {
    try {
        const role = req.user.role?.toUpperCase();
        if (!['ADMIN', 'MANAGER', 'HR'].includes(role)) {
            return res.status(403).json({ success: false, message: 'Permission denied' });
        }

        const product = await Product.findByIdAndUpdate(
            req.params.id,
            { ...req.body, updatedAt: Date.now() },
            { new: true, runValidators: true }
        ).populate('createdBy', 'fullName email');

        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        res.json({ success: true, data: product, message: 'Product updated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete product
router.delete('/products/:id', protect, async (req, res) => {
    try {
        const role = req.user.role?.toUpperCase();
        if (!['ADMIN', 'MANAGER'].includes(role)) {
            return res.status(403).json({ success: false, message: 'Permission denied' });
        }

        const product = await Product.findByIdAndDelete(req.params.id);

        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        res.json({ success: true, message: 'Product deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Toggle product active status
router.patch('/products/:id/toggle-active', protect, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        product.isActive = !product.isActive;
        await product.save();

        res.json({
            success: true,
            data: product,
            message: `Product ${product.isActive ? 'activated' : 'deactivated'}`
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get products for dropdown (active only, minimal data)
router.get('/products/list/active', protect, async (req, res) => {
    try {
        const products = await Product.find({ isActive: true })
            .select('_id name code unitPrice unit taxRate')
            .sort({ name: 1 });

        res.json({ success: true, data: products });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// QUOTE ROUTES
// ============================================

// Get all quotes
router.get('/quotes', protect, async (req, res) => {
    try {
        const {
            status,
            search,
            startDate,
            endDate,
            page = 1,
            limit = 10,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        let query = await buildRoleQuery(req.user, 'owner');

        if (status && status !== 'all') {
            query.status = status;
        }

        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { quoteNumber: { $regex: search, $options: 'i' } }
            ];
        }

        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

        const total = await Quote.countDocuments(query);
        const quotes = await Quote.find(query)
            .populate('owner', 'fullName email avatar')
            .populate('contact', 'firstName lastName email company')
            .populate('deal', 'title value')
            .sort(sortOptions)
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        res.json({
            success: true,
            data: {
                quotes,
                pagination: {
                    total,
                    page: parseInt(page),
                    pages: Math.ceil(total / limit),
                    limit: parseInt(limit)
                }
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get single quote
router.get('/quotes/:id', protect, async (req, res) => {
    try {
        const quote = await Quote.findById(req.params.id)
            .populate('owner', 'fullName email avatar')
            .populate('contact', 'firstName lastName email phone company')
            .populate('deal', 'title value stage')
            .populate('account', 'name')
            .populate('items.product', 'name code');

        if (!quote) {
            return res.status(404).json({ success: false, message: 'Quote not found' });
        }

        res.json({ success: true, data: quote });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Create quote
router.post('/quotes', protect, async (req, res) => {
    try {
        if (!canWrite(req.user.role)) {
            return res.status(403).json({ success: false, message: 'Permission denied' });
        }

        const quoteData = {
            ...req.body,
            owner: req.body.owner || req.user._id
        };

        const quote = await Quote.create(quoteData);
        const populatedQuote = await Quote.findById(quote._id)
            .populate('owner', 'fullName email')
            .populate('contact', 'firstName lastName email')
            .populate('items.product', 'name code');

        res.status(201).json({
            success: true,
            data: populatedQuote,
            message: 'Quote created successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update quote
router.put('/quotes/:id', protect, async (req, res) => {
    try {
        if (!canWrite(req.user.role)) {
            return res.status(403).json({ success: false, message: 'Permission denied' });
        }

        let quote = await Quote.findById(req.params.id);

        if (!quote) {
            return res.status(404).json({ success: false, message: 'Quote not found' });
        }

        // Update quote
        Object.assign(quote, req.body);
        await quote.save();

        quote = await Quote.findById(req.params.id)
            .populate('owner', 'fullName email')
            .populate('contact', 'firstName lastName email')
            .populate('items.product', 'name code');

        res.json({ success: true, data: quote, message: 'Quote updated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete quote
router.delete('/quotes/:id', protect, async (req, res) => {
    try {
        if (!canDelete(req.user.role)) {
            return res.status(403).json({ success: false, message: 'Permission denied' });
        }

        const quote = await Quote.findByIdAndDelete(req.params.id);

        if (!quote) {
            return res.status(404).json({ success: false, message: 'Quote not found' });
        }

        res.json({ success: true, message: 'Quote deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update quote status
router.patch('/quotes/:id/status', protect, async (req, res) => {
    try {
        const { status } = req.body;

        const updateData = { status, updatedAt: Date.now() };

        // If accepted, set accepted date
        if (status === 'accepted') {
            updateData.acceptedDate = new Date();
        }

        const quote = await Quote.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true }
        )
            .populate('owner', 'fullName email')
            .populate('contact', 'firstName lastName email');

        if (!quote) {
            return res.status(404).json({ success: false, message: 'Quote not found' });
        }

        res.json({ success: true, data: quote, message: 'Quote status updated' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Clone/Revise quote
router.post('/quotes/:id/clone', protect, async (req, res) => {
    try {
        const originalQuote = await Quote.findById(req.params.id);

        if (!originalQuote) {
            return res.status(404).json({ success: false, message: 'Quote not found' });
        }

        const quoteData = originalQuote.toObject();
        delete quoteData._id;
        delete quoteData.quoteNumber;
        delete quoteData.createdAt;
        delete quoteData.updatedAt;

        quoteData.status = 'draft';
        quoteData.version = originalQuote.version + 1;
        quoteData.parentQuote = originalQuote._id;
        quoteData.owner = req.user._id;
        quoteData.issueDate = new Date();
        quoteData.expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
        quoteData.acceptedDate = undefined;

        const newQuote = await Quote.create(quoteData);

        // Mark original as revised
        originalQuote.status = 'revised';
        await originalQuote.save();

        const populatedQuote = await Quote.findById(newQuote._id)
            .populate('owner', 'fullName email')
            .populate('contact', 'firstName lastName email');

        res.status(201).json({
            success: true,
            data: populatedQuote,
            message: 'Quote cloned successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get quote stats
router.get('/quotes/stats/summary', protect, async (req, res) => {
    try {
        let query = await buildRoleQuery(req.user, 'owner');

        const [total, byStatus, totalValue, acceptedValue] = await Promise.all([
            Quote.countDocuments(query),
            Quote.aggregate([
                { $match: query },
                { $group: { _id: '$status', count: { $sum: 1 }, value: { $sum: '$grandTotal' } } }
            ]),
            Quote.aggregate([
                { $match: query },
                { $group: { _id: null, total: { $sum: '$grandTotal' } } }
            ]),
            Quote.aggregate([
                { $match: { ...query, status: 'accepted' } },
                { $group: { _id: null, total: { $sum: '$grandTotal' } } }
            ])
        ]);

        res.json({
            success: true,
            data: {
                total,
                byStatus,
                totalValue: totalValue[0]?.total || 0,
                acceptedValue: acceptedValue[0]?.total || 0
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Convert quote to deal
router.post('/quotes/:id/convert-to-deal', protect, async (req, res) => {
    try {
        const quote = await Quote.findById(req.params.id)
            .populate('contact');

        if (!quote) {
            return res.status(404).json({ success: false, message: 'Quote not found' });
        }

        if (quote.deal) {
            return res.status(400).json({
                success: false,
                message: 'Quote already linked to a deal'
            });
        }

        // Create deal from quote
        const deal = await Deal.create({
            title: quote.title,
            value: quote.grandTotal,
            stage: 'proposal',
            probability: 60,
            owner: quote.owner,
            contact: quote.contact?._id,
            expectedCloseDate: quote.expiryDate,
            notes: `Created from Quote: ${quote.quoteNumber}`
        });

        // Link deal to quote
        quote.deal = deal._id;
        quote.status = 'accepted';
        quote.acceptedDate = new Date();
        await quote.save();

        const populatedDeal = await Deal.findById(deal._id)
            .populate('owner', 'fullName email')
            .populate('contact', 'firstName lastName email');

        res.status(201).json({
            success: true,
            data: { quote, deal: populatedDeal },
            message: 'Deal created from quote'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// REPORTS & ANALYTICS
// ============================================

// Sales performance report
router.get('/reports/sales-performance', protect, async (req, res) => {
    try {
        const { startDate, endDate, groupBy = 'month' } = req.query;

        const dateMatch = {};
        if (startDate) dateMatch.$gte = new Date(startDate);
        if (endDate) dateMatch.$lte = new Date(endDate);

        let query = await buildRoleQuery(req.user, 'owner');
        if (Object.keys(dateMatch).length > 0) {
            query.createdAt = dateMatch;
        }

        const groupByFormat = groupBy === 'day'
            ? { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }
            : groupBy === 'week'
                ? { $week: '$createdAt' }
                : { $dateToString: { format: '%Y-%m', date: '$createdAt' } };

        const salesData = await Deal.aggregate([
            { $match: { ...query, stage: 'closed_won' } },
            {
                $group: {
                    _id: groupByFormat,
                    totalDeals: { $sum: 1 },
                    totalValue: { $sum: '$value' },
                    avgDealSize: { $avg: '$value' }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const leadsData = await Lead.aggregate([
            { $match: await buildRoleQuery(req.user) },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);

        res.json({
            success: true,
            data: {
                salesTrend: salesData,
                leadsByStatus: leadsData
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Team leaderboard
router.get('/reports/leaderboard', protect, async (req, res) => {
    try {
        const role = req.user.role?.toUpperCase();

        if (!['ADMIN', 'MANAGER', 'HR'].includes(role)) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to view leaderboard'
            });
        }

        const currentMonth = new Date();
        currentMonth.setDate(1);
        currentMonth.setHours(0, 0, 0, 0);

        const leaderboard = await Deal.aggregate([
            {
                $match: {
                    stage: 'closed_won',
                    actualCloseDate: { $gte: currentMonth }
                }
            },
            {
                $group: {
                    _id: '$owner',
                    totalDeals: { $sum: 1 },
                    totalValue: { $sum: '$value' }
                }
            },
            { $sort: { totalValue: -1 } },
            { $limit: 10 },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'user'
                }
            },
            { $unwind: '$user' },
            {
                $project: {
                    userId: '$_id',
                    name: '$user.fullName',
                    avatar: '$user.avatar',
                    totalDeals: 1,
                    totalValue: 1
                }
            }
        ]);

        res.json({
            success: true,
            data: leaderboard
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Summary statistics for reports
router.get('/reports/summary-stats', protect, async (req, res) => {
    try {
        let query = await buildRoleQuery(req.user, 'owner');

        const [revenueData, activeDeals, totalClosed, newLeads] = await Promise.all([
            // Total Revenue
            Deal.aggregate([
                { $match: { ...query, stage: 'closed_won' } },
                { $group: { _id: null, total: { $sum: '$value' } } }
            ]),
            // Active Deals (In Pipeline)
            Deal.countDocuments({
                ...query,
                stage: { $nin: ['closed_won', 'closed_lost'] }
            }),
            // Total Closed Deals (for win rate)
            Deal.aggregate([
                { $match: { ...query, stage: { $in: ['closed_won', 'closed_lost'] } } },
                { $group: { _id: '$stage', count: { $sum: 1 } } }
            ]),
            // New Leads
            Lead.countDocuments({
                ...await buildRoleQuery(req.user),
                status: 'new'
            })
        ]);

        const wonCount = totalClosed.find(t => t._id === 'closed_won')?.count || 0;
        const lostCount = totalClosed.find(t => t._id === 'closed_lost')?.count || 0;
        const totalClosedCount = wonCount + lostCount;
        const winRate = totalClosedCount > 0 ? Math.round((wonCount / totalClosedCount) * 100) : 0;

        res.json({
            success: true,
            data: {
                totalRevenue: revenueData[0]?.total || 0,
                activeDeals,
                newLeads,
                winRate,
                dealVelocity: 15 // Placeholder for now or calculate if actualCloseDate exists
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// USERS FOR ASSIGNMENT
// ============================================
router.get('/users/assignable', protect, async (req, res) => {
    try {
        const users = await User.find({
            isActive: { $ne: false },
            role: { $in: ['ADMIN', 'MANAGER', 'HR', 'EMPLOYEE', 'SALES'] }
        }).select('_id fullName email avatar role');

        res.json({
            success: true,
            data: users
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;