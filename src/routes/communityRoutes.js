/**
* File: src/routes/communityRoutes.js
* Updated to allow specific roles to create community posts
*/
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { requireLogin, getUserRole } = require('../core/authUtils');
const communityService = require('../core/communityService');
const employeeService = require('../core/employeeService');
const notificationsService = require('../core/notificationsService');

// Define roles allowed to post in Community
const ALLOWED_COMMUNITY_ROLES = [
    'HR',
    'PAYROLL & PERSONAL SPECIALIST',
    'HR & TRAINING MANAGER',
    'SENIOR TALENT ACQUISITION',
    'HR SPECIALIST',
    'COMPENSATION & BENEFITS SPECIALIST'
];

function canPostCommunity(user) {
    if (!user || !user.title) return false;
    const role = user.title.toUpperCase();
    return ALLOWED_COMMUNITY_ROLES.includes(role);
}

// Configure Multer for Community Images
const UPLOAD_FOLDER = 'static/community_uploads';
if (!fs.existsSync(UPLOAD_FOLDER)) {
    fs.mkdirSync(UPLOAD_FOLDER, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOAD_FOLDER);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per image
    fileFilter: (req, file, cb) => {
        if (file.mimetype && file.mimetype.startsWith('image/')) return cb(null, true);
        return cb(new Error('Only image files are allowed.'), false);
    }
});

function uploadCommunityImages(req, res, next) {
    return upload.array('images')(req, res, function (err) {
        if (err) {
            req.flash('danger', err.message || 'Upload failed.');
            return res.redirect('/community/create');
        }
        next();
    });
}

// ==================== ROUTES ====================

// Community Feed (redirects to profile)
router.get('/community/feed', requireLogin, (req, res) => {
    res.redirect('/profile?tab=community');
});

// Create Post Page (Allowed Roles Only)
router.get('/community/create', requireLogin, async (req, res) => {
    if (!canPostCommunity(req.session.user)) {
        req.flash('danger', 'Access denied: only authorized personnel can create community posts.');
        return res.redirect('/profile?tab=community');
    }
    
    const emps = await employeeService.getAllEmployees();
    // Filter for HR employees to allow selecting a poster name if needed
    const hrEmployees = (emps || []).filter((e) => e.title && (String(e.title).toUpperCase().includes('HR') || ALLOWED_COMMUNITY_ROLES.includes(String(e.title).toUpperCase())));
    
    res.render('community/create', { user: req.session.user, hr_employees: hrEmployees });
});

router.post('/community/create', requireLogin, uploadCommunityImages, async (req, res) => {
    if (!canPostCommunity(req.session.user)) {
        return res.redirect('/profile?tab=community');
    }
    
    const content = req.body.content || '';
    const postType = req.body.post_type || 'announcement';
    let posterCode = req.body.poster_code || '';
    let posterName = req.session.user.employee_name;
    
    // If a specific poster was selected from the list
    if (posterCode) {
        const selectedPoster = await employeeService.getEmployeeByCode(String(posterCode));
        if (selectedPoster) {
            posterName = selectedPoster.employee_name;
        } else {
            posterCode = req.session.user.employee_code;
        }
    } else {
        posterCode = req.session.user.employee_code;
    }
    
    if (!content) {
        req.flash('warning', 'Please provide content for the post.');
        return res.redirect('/community/create');
    }
    
    const postUuid = uuidv4();
    const postId = await communityService.createPost(posterCode, posterName, null, content, postType, postUuid);
    
    if (!postId) {
        req.flash('danger', 'Could not create post.');
        return res.redirect('/community/create');
    }
    
    // Save Images
    if (req.files) {
        for (const file of req.files) {
            const relativePath = `community_uploads/${file.filename}`;
            await communityService.addPostImage(postId, relativePath);
        }
    }
    
    // Notify all employees
    try {
        const employees = await employeeService.getAllEmployees();
        const message = `New ${postType} from ${posterName}`;
        const linkUrl = `/profile?tab=community#post-${encodeURIComponent(postId)}`;
        
        for (const emp of (employees || [])) {
            if (!emp.employee_code) continue;
            await notificationsService.addNotification(emp.employee_code, null, message, {
                category: 'community',
                link_url: linkUrl
            });
        }
    } catch (e) {
        console.error('Community notify error:', e.message || e);
    }
    
    req.flash('success', 'Post created successfully.');
    res.redirect('/profile?tab=community');
});

// Like Post
router.post('/community/post/:id/like', requireLogin, async (req, res) => {
    const user = req.session.user;
    await communityService.toggleLike(req.params.id, user.employee_code, user.employee_name);
    res.redirect('/profile?tab=community#post-' + encodeURIComponent(req.params.id));
});

// Comment on Post
router.post('/community/post/:id/comment', requireLogin, async (req, res) => {
    const commentText = req.body.comment || '';
    if (!commentText) {
        req.flash('warning', 'Comment cannot be empty.');
        return res.redirect('/profile?tab=community');
    }
    const user = req.session.user;
    await communityService.addComment(req.params.id, user.employee_code, user.employee_name, commentText);
    res.redirect('/profile?tab=community#post-' + encodeURIComponent(req.params.id));
});

// Delete Post (Allowed Roles Only)
router.post('/community/post/:id/delete', requireLogin, async (req, res) => {
    if (!canPostCommunity(req.session.user)) {
        req.flash('danger', 'Only authorized personnel can delete posts.');
        return res.redirect('/profile?tab=community');
    }
    await communityService.deletePost(req.params.id);
    req.flash('success', 'Post deleted.');
    res.redirect('/profile?tab=community');
});

module.exports = router;