// Wrap all DOM access in DOMContentLoaded to ensure elements exist
document.addEventListener('DOMContentLoaded', function () {
  const popup = document.getElementById('custom-popup');
  const closeBtn = popup ? popup.querySelector('.close-btn') : null;
  const form = document.getElementById('popup-form');
  let currentJobId = null;

  // Attach event listeners to all "Mark As Complete" buttons
  document.querySelectorAll('.complete-button').forEach(function (button) {
    button.addEventListener('click', function () {
      currentJobId = this.getAttribute('data-job-id');
      if (popup) popup.style.display = 'flex';
    });
  });

  // close handlers
  if (closeBtn) closeBtn.addEventListener('click', function () { if (popup) popup.style.display = 'none'; });
  window.addEventListener('click', function (event) { if (event.target === popup && popup) popup.style.display = 'none'; });

  // handle form submission
  if (form) {
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      const pinEl = document.getElementById('pin');
      const pin = pinEl ? pinEl.value : '';

      const btn = document.querySelector(`.complete-button[data-job-id="${currentJobId}"]`);
      if (!btn) { alert('Job button not found'); return; }
      const employeeId = btn.getAttribute('data-employee-id');
      const pay = btn.getAttribute('data-pay');
      const title = btn.getAttribute('data-title');

      // read manager id from window (set by server-rendered page)
      const from = window.fb_id || '';
      const to = employeeId;
      const amount = pay;
      const reason = `Completed ${title}`;

      if (popup) popup.style.display = 'none';
      form.reset();

      // call transfer endpoint
      fetch('/api/digipogs/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, amount, reason, pin })
      }).then(r => r.json()).then(data => {
        if (data && data.success) {
          // mark job complete on server
          fetch(`/job/${currentJobId}/complete`, { method: 'POST' })
            .then(r => r.json()).then(js => {
              if (js && js.success) window.location.reload();
              else alert('Transfer succeeded but failed to mark job complete.');
            }).catch(err => { console.error(err); alert('Transfer succeeded but failed to mark job complete.'); });
        } else {
          alert('Transfer failed: ' + (data && data.message ? data.message : 'unknown'));
        }
      }).catch(err => { console.error('Transfer error', err); alert('Transfer error'); });
    });
  }

  // Handle "Accept" button clicks
  document.querySelectorAll('.accept').forEach(button => {
    button.addEventListener('click', async function () {
      const jobId = this.getAttribute('data-job-id');
      const applicantId = this.getAttribute('data-applicant-id');

      if (!confirm('Accept this applicant for the job?')) {
        return;
      }

      try {
        const response = await fetch('/jobManager/accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId: jobId,
            applicantId: applicantId
          })
        });

        const result = await response.json();

        if (response.ok) {
          location.reload();
        } else {
          alert(result.error || 'Failed to accept applicant');
        }
      } catch (err) {
        console.error('Error accepting applicant:', err);
        alert('An error occurred');
      }
    });
  });
});