/**
 * CRM Models
 * Lead, Deal, Contact, Activity schemas for CRM module
 */

const mongoose = require('mongoose');

// ============================================
// LEAD SCHEMA
// ============================================
const leadSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: [true, 'Lead name is required'],
        trim: true 
    },
    email: { 
        type: String, 
        required: [true, 'Email is required'],
        lowercase: true,
        trim: true
    },
    phone: { 
        type: String,
        trim: true 
    },
    company: { 
        type: String,
        trim: true 
    },
    position: {
        type: String,
        trim: true
    },
    status: { 
        type: String, 
        enum: ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'lost', 'converted'],
        default: 'new'
    },
    source: { 
        type: String,
        enum: ['website', 'referral', 'social_media', 'advertisement', 'cold_call', 'email_campaign', 'trade_show', 'other'],
        default: 'website'
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    estimatedValue: {
        type: Number,
        default: 0
    },
    assignedTo: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    notes: { 
        type: String 
    },
    tags: [{
        type: String,
        trim: true
    }],
    lastContactedAt: {
        type: Date
    },
    nextFollowUp: {
        type: Date
    },
    convertedToContactId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CRMContact'
    },
    convertedToDealId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Deal'
    }
}, { 
    timestamps: true 
});

// Indexes for better query performance
leadSchema.index({ assignedTo: 1, status: 1 });
leadSchema.index({ email: 1 });
leadSchema.index({ createdAt: -1 });
leadSchema.index({ status: 1 });

// ============================================
// DEAL SCHEMA
// ============================================
const dealSchema = new mongoose.Schema({
    title: { 
        type: String, 
        required: [true, 'Deal title is required'],
        trim: true 
    },
    value: { 
        type: Number, 
        required: [true, 'Deal value is required'],
        min: 0
    },
    currency: {
        type: String,
        default: 'USD'
    },
    stage: { 
        type: String, 
        enum: ['prospecting', 'qualification', 'needs_analysis', 'proposal', 'negotiation', 'closed_won', 'closed_lost'],
        default: 'prospecting'
    },
    probability: { 
        type: Number, 
        default: 10,
        min: 0,
        max: 100
    },
    owner: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    contact: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'CRMContact'
    },
    lead: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lead'
    },
    expectedCloseDate: { 
        type: Date 
    },
    actualCloseDate: {
        type: Date
    },
    lostReason: {
        type: String,
        enum: ['price', 'competition', 'no_budget', 'timing', 'no_response', 'other'],
    },
    notes: { 
        type: String 
    },
    products: [{
        name: String,
        quantity: Number,
        price: Number
    }],
    competitors: [{
        name: String,
        strengths: String,
        weaknesses: String
    }]
}, { 
    timestamps: true 
});

// Indexes
dealSchema.index({ owner: 1, stage: 1 });
dealSchema.index({ stage: 1 });
dealSchema.index({ expectedCloseDate: 1 });
dealSchema.index({ createdAt: -1 });

// Auto-update probability based on stage
dealSchema.pre('save', function(next) {
    const stageProbabilities = {
        'prospecting': 10,
        'qualification': 20,
        'needs_analysis': 40,
        'proposal': 60,
        'negotiation': 80,
        'closed_won': 100,
        'closed_lost': 0
    };
    
    if (this.isModified('stage') && !this.isModified('probability')) {
        this.probability = stageProbabilities[this.stage] || this.probability;
    }
    
    if (this.stage === 'closed_won' || this.stage === 'closed_lost') {
        this.actualCloseDate = new Date();
    }
    
    next();
});

// ============================================
// CONTACT SCHEMA
// ============================================
const contactSchema = new mongoose.Schema({
    firstName: { 
        type: String, 
        required: [true, 'First name is required'],
        trim: true 
    },
    lastName: { 
        type: String, 
        required: [true, 'Last name is required'],
        trim: true 
    },
    email: { 
        type: String, 
        required: [true, 'Email is required'],
        lowercase: true,
        trim: true
    },
    phone: { 
        type: String,
        trim: true 
    },
    mobile: {
        type: String,
        trim: true
    },
    company: { 
        type: String,
        trim: true 
    },
    position: { 
        type: String,
        trim: true 
    },
    department: {
        type: String,
        trim: true
    },
    address: {
        street: String,
        city: String,
        state: String,
        zipCode: String,
        country: String
    },
    socialProfiles: {
        linkedin: String,
        twitter: String,
        facebook: String
    },
    assignedTo: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    accountId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CRMAccount'
    },
    tags: [{
        type: String,
        trim: true
    }],
    notes: {
        type: String
    },
    isActive: {
        type: Boolean,
        default: true
    },
    dateOfBirth: {
        type: Date
    },
    leadSource: {
        type: String
    }
}, { 
    timestamps: true 
});

// Virtual for full name
contactSchema.virtual('fullName').get(function() {
    return `${this.firstName} ${this.lastName}`;
});

// Indexes
contactSchema.index({ assignedTo: 1 });
contactSchema.index({ email: 1 });
contactSchema.index({ company: 1 });
contactSchema.index({ createdAt: -1 });

// ============================================
// ACTIVITY SCHEMA (Tasks, Calls, Meetings, Emails)
// ============================================
const activitySchema = new mongoose.Schema({
    type: { 
        type: String, 
        enum: ['call', 'email', 'meeting', 'task', 'note', 'follow_up'],
        required: true 
    },
    title: { 
        type: String, 
        required: [true, 'Activity title is required'],
        trim: true 
    },
    description: { 
        type: String 
    },
    dueDate: { 
        type: Date 
    },
    dueTime: {
        type: String
    },
    duration: {
        type: Number, // in minutes
        default: 30
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'medium'
    },
    status: {
        type: String,
        enum: ['pending', 'in_progress', 'completed', 'cancelled'],
        default: 'pending'
    },
    completed: { 
        type: Boolean, 
        default: false 
    },
    completedAt: {
        type: Date
    },
    relatedTo: { 
        type: mongoose.Schema.Types.ObjectId, 
        refPath: 'relatedModel' 
    },
    relatedModel: { 
        type: String, 
        enum: ['Lead', 'Deal', 'CRMContact'] 
    },
    assignedTo: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    outcome: {
        type: String
    },
    reminder: {
        type: Date
    }
}, { 
    timestamps: true 
});

// Indexes
activitySchema.index({ assignedTo: 1, completed: 1 });
activitySchema.index({ dueDate: 1 });
activitySchema.index({ relatedTo: 1, relatedModel: 1 });

// ============================================
// ACCOUNT SCHEMA (Companies/Organizations)
// ============================================
const accountSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Account name is required'],
        trim: true
    },
    industry: {
        type: String,
        trim: true
    },
    website: {
        type: String,
        trim: true
    },
    phone: {
        type: String,
        trim: true
    },
    email: {
        type: String,
        lowercase: true,
        trim: true
    },
    employees: {
        type: Number
    },
    annualRevenue: {
        type: Number
    },
    address: {
        street: String,
        city: String,
        state: String,
        zipCode: String,
        country: String
    },
    description: {
        type: String
    },
    type: {
        type: String,
        enum: ['prospect', 'customer', 'partner', 'competitor', 'other'],
        default: 'prospect'
    },
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    parentAccount: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CRMAccount'
    }
}, {
    timestamps: true
});

// Indexes
accountSchema.index({ assignedTo: 1 });
accountSchema.index({ name: 1 });

// ============================================
// MEETING SCHEMA
// ============================================
const meetingSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Meeting title is required'],
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    meetingType: {
        type: String,
        enum: ['online', 'in_person', 'phone', 'video_conference'],
        default: 'online'
    },
    status: {
        type: String,
        enum: ['scheduled', 'completed', 'cancelled', 'rescheduled', 'no_show'],
        default: 'scheduled'
    },
    startDate: {
        type: Date,
        required: [true, 'Start date is required']
    },
    endDate: {
        type: Date,
        required: [true, 'End date is required']
    },
    startTime: {
        type: String,
        required: true
    },
    endTime: {
        type: String,
        required: true
    },
    location: {
        type: String,
        trim: true
    },
    meetingLink: {
        type: String,
        trim: true
    },
    host: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    participants: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        email: String,
        name: String,
        status: {
            type: String,
            enum: ['pending', 'accepted', 'declined', 'tentative'],
            default: 'pending'
        }
    }],
    relatedTo: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'relatedModel'
    },
    relatedModel: {
        type: String,
        enum: ['Lead', 'Deal', 'CRMContact', 'CRMAccount']
    },
    reminder: {
        type: Number, // minutes before meeting
        default: 30
    },
    notes: {
        type: String
    },
    outcome: {
        type: String
    },
    attachments: [{
        name: String,
        url: String,
        type: String
    }],
    isRecurring: {
        type: Boolean,
        default: false
    },
    recurrencePattern: {
        frequency: {
            type: String,
            enum: ['daily', 'weekly', 'monthly', 'yearly']
        },
        interval: Number,
        endDate: Date
    }
}, {
    timestamps: true
});

// Indexes
meetingSchema.index({ host: 1, startDate: 1 });
meetingSchema.index({ startDate: 1 });
meetingSchema.index({ status: 1 });

// ============================================
// CALL SCHEMA
// ============================================
const callSchema = new mongoose.Schema({
    subject: {
        type: String,
        required: [true, 'Call subject is required'],
        trim: true
    },
    callType: {
        type: String,
        enum: ['outbound', 'inbound', 'missed', 'scheduled'],
        default: 'outbound'
    },
    status: {
        type: String,
        enum: ['scheduled', 'completed', 'cancelled', 'no_answer', 'busy', 'failed'],
        default: 'scheduled'
    },
    callPurpose: {
        type: String,
        enum: ['prospecting', 'follow_up', 'demo', 'negotiation', 'support', 'other'],
        default: 'follow_up'
    },
    callResult: {
        type: String,
        enum: ['interested', 'not_interested', 'callback', 'no_answer', 'left_voicemail', 'wrong_number', 'other'],
    },
    startTime: {
        type: Date,
        required: true
    },
    endTime: {
        type: Date
    },
    duration: {
        type: Number, // in seconds
        default: 0
    },
    phoneNumber: {
        type: String,
        trim: true
    },
    caller: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    relatedTo: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'relatedModel'
    },
    relatedModel: {
        type: String,
        enum: ['Lead', 'Deal', 'CRMContact', 'CRMAccount']
    },
    contactName: {
        type: String,
        trim: true
    },
    contactEmail: {
        type: String,
        trim: true
    },
    notes: {
        type: String
    },
    outcome: {
        type: String
    },
    followUpDate: {
        type: Date
    },
    followUpAction: {
        type: String
    },
    recording: {
        url: String,
        duration: Number
    },
    reminder: {
        type: Date
    }
}, {
    timestamps: true
});

// Indexes
callSchema.index({ caller: 1, startTime: -1 });
callSchema.index({ status: 1 });
callSchema.index({ relatedTo: 1, relatedModel: 1 });

// ============================================
// PRODUCT SCHEMA
// ============================================
const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Product name is required'],
        trim: true
    },
    code: {
        type: String,
        unique: true,
        sparse: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    category: {
        type: String,
        trim: true
    },
    type: {
        type: String,
        enum: ['product', 'service', 'subscription', 'bundle'],
        default: 'product'
    },
    unitPrice: {
        type: Number,
        required: [true, 'Unit price is required'],
        min: 0
    },
    currency: {
        type: String,
        default: 'USD'
    },
    costPrice: {
        type: Number,
        min: 0,
        default: 0
    },
    taxRate: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
    },
    taxable: {
        type: Boolean,
        default: true
    },
    unit: {
        type: String,
        default: 'unit' // unit, hour, license, etc.
    },
    sku: {
        type: String,
        trim: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    stockQuantity: {
        type: Number,
        default: 0
    },
    lowStockThreshold: {
        type: Number,
        default: 10
    },
    image: {
        type: String
    },
    features: [{
        type: String
    }],
    specifications: [{
        key: String,
        value: String
    }],
    vendor: {
        name: String,
        contact: String,
        email: String
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    timestamps: true
});

// Indexes
productSchema.index({ name: 'text', description: 'text' });
productSchema.index({ category: 1 });
productSchema.index({ isActive: 1 });
productSchema.index({ code: 1 });

// Auto-generate product code
productSchema.pre('save', async function(next) {
    if (!this.code) {
        const count = await mongoose.model('Product').countDocuments();
        this.code = `PRD-${String(count + 1).padStart(5, '0')}`;
    }
    next();
});

// ============================================
// QUOTE SCHEMA
// ============================================
const quoteSchema = new mongoose.Schema({
    quoteNumber: {
        type: String,
        unique: true
    },
    title: {
        type: String,
        required: [true, 'Quote title is required'],
        trim: true
    },
    status: {
        type: String,
        enum: ['draft', 'pending', 'sent', 'accepted', 'rejected', 'expired', 'revised'],
        default: 'draft'
    },
    deal: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Deal'
    },
    contact: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CRMContact'
    },
    account: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CRMAccount'
    },
    // Billing Information
    billingAddress: {
        name: String,
        company: String,
        street: String,
        city: String,
        state: String,
        zipCode: String,
        country: String,
        phone: String,
        email: String
    },
    // Shipping Information (if different)
    shippingAddress: {
        name: String,
        company: String,
        street: String,
        city: String,
        state: String,
        zipCode: String,
        country: String,
        phone: String
    },
    // Line Items
    items: [{
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product'
        },
        productName: String,
        description: String,
        quantity: {
            type: Number,
            required: true,
            min: 1
        },
        unitPrice: {
            type: Number,
            required: true,
            min: 0
        },
        discount: {
            type: Number,
            default: 0,
            min: 0,
            max: 100
        },
        discountType: {
            type: String,
            enum: ['percentage', 'fixed'],
            default: 'percentage'
        },
        tax: {
            type: Number,
            default: 0
        },
        total: {
            type: Number,
            required: true
        }
    }],
    // Totals
    subtotal: {
        type: Number,
        default: 0
    },
    totalDiscount: {
        type: Number,
        default: 0
    },
    totalTax: {
        type: Number,
        default: 0
    },
    shippingCost: {
        type: Number,
        default: 0
    },
    grandTotal: {
        type: Number,
        default: 0
    },
    currency: {
        type: String,
        default: 'USD'
    },
    // Dates
    issueDate: {
        type: Date,
        default: Date.now
    },
    expiryDate: {
        type: Date,
        required: true
    },
    acceptedDate: {
        type: Date
    },
    // Terms
    termsAndConditions: {
        type: String
    },
    notes: {
        type: String
    },
    internalNotes: {
        type: String
    },
    // Owner
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // Revision tracking
    version: {
        type: Number,
        default: 1
    },
    parentQuote: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Quote'
    },
    // Attachments
    attachments: [{
        name: String,
        url: String,
        type: String
    }]
}, {
    timestamps: true
});

// Indexes
quoteSchema.index({ owner: 1, status: 1 });
quoteSchema.index({ quoteNumber: 1 });
quoteSchema.index({ deal: 1 });
quoteSchema.index({ contact: 1 });
quoteSchema.index({ createdAt: -1 });

// Auto-generate quote number
quoteSchema.pre('save', async function(next) {
    if (!this.quoteNumber) {
        const count = await mongoose.model('Quote').countDocuments();
        const year = new Date().getFullYear();
        this.quoteNumber = `QT-${year}-${String(count + 1).padStart(5, '0')}`;
    }
    
    // Calculate totals
    if (this.items && this.items.length > 0) {
        let subtotal = 0;
        let totalDiscount = 0;
        let totalTax = 0;
        
        this.items.forEach(item => {
            const itemSubtotal = item.quantity * item.unitPrice;
            let discountAmount = 0;
            
            if (item.discountType === 'percentage') {
                discountAmount = (itemSubtotal * item.discount) / 100;
            } else {
                discountAmount = item.discount;
            }
            
            const afterDiscount = itemSubtotal - discountAmount;
            const taxAmount = (afterDiscount * (item.tax || 0)) / 100;
            
            item.total = afterDiscount + taxAmount;
            subtotal += itemSubtotal;
            totalDiscount += discountAmount;
            totalTax += taxAmount;
        });
        
        this.subtotal = subtotal;
        this.totalDiscount = totalDiscount;
        this.totalTax = totalTax;
        this.grandTotal = subtotal - totalDiscount + totalTax + (this.shippingCost || 0);
    }
    
    next();
});

// ============================================
// CREATE MODELS
// ============================================

const Lead = mongoose.model('Lead', leadSchema);
const Deal = mongoose.model('Deal', dealSchema);
const CRMContact = mongoose.model('CRMContact', contactSchema);
const Activity = mongoose.model('Activity', activitySchema);
const CRMAccount = mongoose.model('CRMAccount', accountSchema);
const Meeting = mongoose.model('Meeting', meetingSchema);
const Call = mongoose.model('Call', callSchema);
const Product = mongoose.model('Product', productSchema);
const Quote = mongoose.model('Quote', quoteSchema);

// ============================================
// EXPORT ALL MODELS (ONLY ONE EXPORT BLOCK)
// ============================================

module.exports = {
    Lead,
    Deal,
    CRMContact,
    Activity,
    CRMAccount,
    Meeting,
    Call,
    Product,
    Quote
};