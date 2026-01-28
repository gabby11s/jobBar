require('dotenv').config();
const router = require('express').Router();
const isAuthenticated = require('../middleware/isAuthenticated');

// Home route
router.get('/', isAuthenticated, (req, res) => {
    res.render('index', { title: 'Home' });
});

module.exports = router;