require('dotenv').config();
const router = require('express').Router();
const isAuthenticated = require('../middleware/isAuthenticated');

// Route: show a single company and its jobs by company name (same EJS page)
router.get('/jobManager/:companyName', isAuthenticated, (req, res) => {
    const db = req.app.locals.db;
    const companyName = req.params.companyName;

    // Get company details
    db.get('SELECT * FROM companies WHERE name = ? COLLATE NOCASE', [companyName], (err, company) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).send('Internal Server Error');
        }

        if (!company) {
            return res.status(404).send('Company not found');
        }

        // Check if user is the owner
        if (company.owner_id !== req.session.fb_id) {
            return res.status(403).send('You do not have permission to manage jobs for this company');
        }

        // Get jobs with application data
        const jobsQuery = `
            SELECT 
                j.*,
                u.username as employee_name,
                COUNT(DISTINCT ja.fb_id) as applicants_count,
                GROUP_CONCAT(DISTINCT ja.fb_id) as applicant_ids
            FROM jobs j
            LEFT JOIN job_applications ja ON j.id = ja.job_id
            LEFT JOIN users u ON j.employee_id = u.fb_id
            WHERE j.company = ? COLLATE NOCASE
            GROUP BY j.id
            ORDER BY j.id DESC
        `;

        db.all(jobsQuery, [companyName], (err, jobs) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).send('Internal Server Error');
            }

            // Fetch applicant details for each job
            const jobPromises = jobs.map(job => {
                return new Promise((resolve) => {
                    if (!job.applicant_ids) {
                        job.applicants = [];
                        job.has_applications = false;
                        return resolve(job);
                    }

                    const ids = job.applicant_ids.split(',');
                    const placeholders = ids.map(() => '?').join(',');
                    
                    db.all(
                        `SELECT fb_id, username FROM users WHERE fb_id IN (${placeholders})`,
                        ids,
                        (err, applicants) => {
                            if (err) {
                                console.error('Error fetching applicants:', err);
                                job.applicants = [];
                            } else {
                                job.applicants = applicants.map(a => ({
                                    fb_id: a.fb_id,
                                    name: a.username || 'Unknown User'
                                }));
                            }
                            job.has_applications = job.applicants.length > 0;
                            resolve(job);
                        }
                    );
                });
            });

            Promise.all(jobPromises).then(jobsWithApplicants => {
                res.render('jobManager', { 
                    company, 
                    jobs: jobsWithApplicants, 
                    fb_id: req.session.fb_id 
                });
            });
        });
    });
});

// Route to mark a job as complete
router.post('/job/:jobId/complete', isAuthenticated, (req, res) => {
    const db = req.app.locals.db;
    const jobId = req.params.jobId;
    const { pin } = req.body;
    const userId = req.session.fb_id;

    // TODO: Verify the PIN matches the user's PIN
    // For now, we'll just update the status

    // Verify the job is taken by this user
    db.get('SELECT * FROM jobs WHERE id = ? AND employee_id = ?', [jobId, userId], (err, job) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }

        if (!job) {
            return res.status(403).json({ success: false, message: 'Job not found or not assigned to you' });
        }

        // Update job status to completed
        db.run('UPDATE jobs SET status = ? WHERE id = ?', ['completed', jobId], function (updateErr) {
            if (updateErr) {
                console.error('Error updating job:', updateErr);
                return res.status(500).json({ success: false, message: 'Error updating job' });
            }

            res.json({ success: true });
        });
    });
});
// Mark a job as complete (called after successful transfer)
router.post('/job/:id/complete', isAuthenticated, (req, res) => {
    const db = req.app.locals.db;
    const jobId = req.params.id;
    const requesterFb = req.session && req.session.fb_id ? String(req.session.fb_id) : null;

    if (!requesterFb) return res.status(403).json({ success: false, message: 'Forbidden' });

    // Find the job and its company, then verify requester is the company owner or root admin (fb_id === '1')
    db.get('SELECT j.*, c.owner_id FROM jobs j LEFT JOIN companies c ON j.company = c.name WHERE j.id = ?', [jobId], (err, row) => {
        if (err) {
            console.error('DB error fetching job:', err);
            return res.status(500).json({ success: false, message: 'DB error' });
        }
        if (!row) return res.status(404).json({ success: false, message: 'Job not found' });

        const ownerFb = row.owner_id !== undefined && row.owner_id !== null ? String(row.owner_id) : null;
        if (requesterFb !== ownerFb && requesterFb !== '1') {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        db.run('DELETE FROM jobs WHERE id = ?', [jobId], function(delErr) {
            if (delErr) {
                console.error('Failed to mark job complete:', delErr);
                return res.status(500).json({ success: false, message: 'DB error' });
            }
            return res.json({ success: true });
        });
    });
});

// Accept an applicant and assign them to the job (no PIN required)
router.post('/jobManager/accept', isAuthenticated, async (req, res) => {
    const db = req.app.locals.db;
    const { jobId, applicantId } = req.body;
    const ownerId = req.session.fb_id;

    if (!jobId || !applicantId) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        // Get job details to verify ownership
        const job = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM jobs WHERE id = ?', [jobId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }

        // Verify company ownership
        const company = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM companies WHERE name = ? COLLATE NOCASE', [job.company], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!company || company.owner_id !== ownerId) {
            return res.status(403).json({ error: 'You do not own this company' });
        }

        // Assign the applicant to the job
        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE jobs SET employee_id = ?, status = ? WHERE id = ?',
                [applicantId, 'in_progress', jobId],
                function(err) {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        // Remove all applications for this job
        await new Promise((resolve, reject) => {
            db.run('DELETE FROM job_applications WHERE job_id = ?', [jobId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Error accepting applicant:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;




