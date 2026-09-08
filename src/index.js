require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const attendanceRoutes = require('./routes/attendance');
const adminRoutes = require('./routes/admin');
const sitesRoutes = require('./routes/sites');
const guestsRoutes = require('./routes/guests');
const signoffRoutes = require('./routes/signoff');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/auth', authRoutes);
app.use('/attendance', attendanceRoutes);
app.use('/admin', adminRoutes);
app.use('/admin/sites', sitesRoutes);
app.use('/attendance/guest', guestsRoutes);
app.use('/admin/signoff', signoffRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Attendance API running on port ${PORT}`));
