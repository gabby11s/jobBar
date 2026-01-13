require('dotenv').config();
const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const isAuthenticated = require('../middleware/isAuthenticated');

// Freelance route
router.get('/freelance', isAuthenticated, (req, res) => {
    res.render('freelance', { title: 'Freelance Page' });
});

module.exports = router;