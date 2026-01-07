const router = require('express').Router();
const path = require('path');
const fs = require('fs');

// Home route
router.get('/', (req, res) => {
    res.render('index', { title: 'Home' });
});