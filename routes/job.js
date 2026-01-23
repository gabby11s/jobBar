require('dotenv').config();
const router = require('express').Router();
const isAuthenticated = require('../middleware/isAuthenticated');

// Route: show a single company and its jobs by company name (same EJS page)
router.get('/job/:companyName', isAuthenticated, (req, res) => {
    const db = req.app.locals.db;
    const companyName = req.params.companyName; // express already decodes URL components

    // get all companies (for navigation/listing)
    const companiesQuery = `SELECT * FROM companies`;

    // The `jobs` table stores the company as a text column named `company` (not company_id).
    // Query jobs by company name (case-insensitive) and order newest first.
    const jobsQuery = `
        SELECT j.*
        FROM jobs j
        WHERE j.company = ? COLLATE NOCASE
        ORDER BY j.id DESC
    `;

    db.all(companiesQuery, [], (err, companies) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Internal Server Error');
        }

        db.all(jobsQuery, [companyName], (err2, jobs) => {
            if (err2) {
                console.error(err2);
                return res.status(500).send('Internal Server Error');
            }

            // find the selected company object by name (case-insensitive)
            const selectedCompany = companies.find(c => String(c.name).toLowerCase() === String(companyName).toLowerCase()) || null;

            // render job view — the template expects `company` (singular), so pass that
            // pass current session user info so template can show apply buttons
            res.render('job', { companies, company: selectedCompany, jobs, user: req.session.user, fb_id: req.session.fb_id });
        });
    });
});

// Apply to a job: set jobs.employee_id to the current user's fb_id (formbar_Id) instead of numeric users.id
router.post('/job/:jobId/apply', isAuthenticated, (req, res) => {
    const db = req.app.locals.db;
    const jobId = req.params.jobId;
    const fbId = req.session.fb_id;

    if (!fbId) return res.status(400).send('User not identified');

    // Atomically set employee_id to the fb_id only if it's currently NULL (not taken)
    db.run(
        'UPDATE jobs SET employee_id = ? WHERE id = ? AND (employee_id IS NULL OR employee_id = 0)',
        [fbId, jobId],
        function (updateErr) {
            if (updateErr) {
                console.error('DB error updating job:', updateErr);
                return res.status(500).send('Internal Server Error');
            }

            // Redirect back to the referring page if available, otherwise to home
            const referer = req.get('Referrer') || '/';
            return res.redirect(referer);
        }
    );
});

module.exports = router;