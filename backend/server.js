require('./config/env');

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');

const connectDB = require('./config/db');
const Due = require('./models/Due');
const House = require('./models/House');
const { createNotification } = require('./controllers/notificationController');

const app = express();
const PORT = process.env.PORT || 5000;

connectDB();

const uploadDirectories = [
    'uploads',
    'uploads/payment-proofs'
];

uploadDirectories.forEach((directory) => {
    fs.mkdirSync(path.join(__dirname, directory), {
        recursive: true
    });
});


app.set(
    'trust proxy',
    process.env.TRUST_PROXY === 'true' ? 1 : false
);


app.use(
    helmet({
        crossOriginResourcePolicy: {
            policy: 'cross-origin'
        }
    })
);

/*
 * --------------------------------------------------
 * CORS
 * --------------------------------------------------
 *
 * Frontend normally runs on port 3000.
 * Backend runs on port 5000.
 *
 * During development, localhost/127.0.0.1
 * origins on any port are allowed.
 */
const allowedOrigins = (
    process.env.CLIENT_URL ||
    'http://localhost:3000,http://127.0.0.1:3000'
)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const isDevelopment = process.env.NODE_ENV !== 'production';

const isLocalhost = (origin) => {
    try {
        const url = new URL(origin);

        return (
            url.protocol === 'http:' &&
            (url.hostname === 'localhost' ||
                url.hostname === '127.0.0.1')
        );
    } catch {
        return false;
    }
};

app.use(
    cors({
        origin: (origin, callback) => {
            // Allow requests without an Origin header.
            if (!origin) {
                return callback(null, true);
            }

            // Allow configured origins.
            if (allowedOrigins.includes(origin)) {
                return callback(null, true);
            }

            // Allow localhost during development.
            if (isDevelopment && isLocalhost(origin)) {
                return callback(null, true);
            }

            console.warn(`CORS blocked: ${origin}`);

            return callback(
                new Error('Origin not allowed by CORS')
            );
        },
        credentials: true
    })
);


const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests. Please try again later.'
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    message: 'Too many login attempts. Please try again later.'
});

app.use(generalLimiter);

/*
 * --------------------------------------------------
 * Body parsing
 * --------------------------------------------------
 */
app.use(
    express.json({
        limit: '1mb'
    })
);

/*
 * --------------------------------------------------
 * Static uploads
 * --------------------------------------------------
 */
app.use(
    '/uploads',
    (req, res, next) => {
        if (req.path.startsWith('/payment-proofs/')) {
            return res.status(403).json({
                success: false,
                message: 'Private file'
            });
        }

        next();
    },
    express.static(path.join(__dirname, 'uploads'))
);

// Routes


app.use(
    '/api/auth',
    authLimiter,
    require('./routes/auth')
);

app.use(
    '/api/houses',
    require('./routes/houses')
);

app.use(
    '/api/dues',
    require('./routes/dues')
);

app.use(
    '/api/complaints',
    require('./routes/complaints')
);

app.use(
    '/api/notices',
    require('./routes/notices')
);

app.use(
    '/api/notifications',
    require('./routes/notifications')
);

app.use(
    '/api/users',
    require('./routes/users')
);

app.use(
    '/api/exports',
    require('./routes/exports')
);

app.use(
    '/api/polls',
    require('./routes/polls')
);


app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Tole Management API is running'
    });
});

// Error handling middleware
app.use(require('./middleware/errorHandler'));

/*
 * ==================================================
 * AUTOMATION
 * ==================================================
 */

/*
 * Generate monthly dues
 * Runs at 8:00 AM on the first day of every month.
 */
cron.schedule('0 8 1 * *', async () => {
    try {
        console.log('Cron: Generating monthly dues...');

        const now = new Date();

        const houses = await House.find({
            isOccupied: true
        });

        let created = 0;

        for (const house of houses) {
            const month = now.getMonth() + 1;
            const year = now.getFullYear();

            const existingDue = await Due.findOne({
                house: house._id,
                month,
                year
            });

            if (existingDue) {
                continue;
            }

            const dueDate = new Date(
                year,
                now.getMonth(),
                10,
                23,
                59,
                59,
                999
            );

            const isOverdue = dueDate < now;

            const daysLate = isOverdue
                ? Math.max(
                    0,
                    Math.floor(
                        (now - dueDate) /
                        (1000 * 60 * 60 * 24)
                    )
                )
                : 0;

            const due = await Due.create({
                house: house._id,
                month,
                year,
                amount: house.monthlyDue,
                fine: daysLate * 10,
                status: isOverdue
                    ? 'overdue'
                    : 'pending',
                dueDate
            });

            created++;

            const recipients = [
                house.owner,
                house.tenant
            ].filter(Boolean);

            for (const userId of recipients) {
                await createNotification({
                    user: userId,
                    title: 'New Due Generated',
                    message:
                        `Rs. ${house.monthlyDue} due generated for ` +
                        `${house.houseNo}. Please pay before the 10th ` +
                        `to avoid fine.`,
                    type: 'due',
                    link: '/dues'
                });
            }
        }

        console.log(
            `Monthly dues generated: ${created}`
        );
    } catch (error) {
        console.error(
            'Monthly dues cron error:',
            error
        );
    }
});

/*
 * Update overdue fines
 * Runs every day at midnight.
 */
cron.schedule('0 0 * * *', async () => {
    try {
        const now = new Date();

        const overdueDues = await Due.find({
            status: {
                $in: ['pending', 'overdue']
            },
            dueDate: {
                $lt: now
            }
        }).populate('house');

        for (const due of overdueDues) {
            const daysLate = Math.max(
                0,
                Math.floor(
                    (now - due.dueDate) /
                    (1000 * 60 * 60 * 24)
                )
            );

            due.fine = daysLate * 10;
            due.status = 'overdue';

            await due.save();

            const house = due.house;

            if (!house) {
                continue;
            }

            const recipients = [
                house.owner,
                house.tenant
            ].filter(Boolean);

            for (const userId of recipients) {
                await createNotification({
                    user: userId,
                    title: 'Payment Overdue',
                    message:
                        `Your due for ${house.houseNo || 'your house'} ` +
                        `is overdue. Fine: Rs. ${due.fine}.`,
                    type: 'overdue',
                    link: '/dues'
                });
            }
        }

        if (overdueDues.length > 0) {
            console.log(
                `Updated ${overdueDues.length} overdue dues`
            );
        }
    } catch (error) {
        console.error(
            'Daily fine update cron error:',
            error
        );
    }
});

const server = app.listen(PORT, () => {
    console.log(
        `Server running on http://localhost:${PORT}`
    );
});

/*
 * --------------------------------------------------
 * Graceful shutdown
 * --------------------------------------------------
 */
const gracefulShutdown = async (signal) => {
    console.log(`${signal} received. Shutting down...`);

    server.close(async () => {
        try {
            const mongoose = require('mongoose');

            await mongoose.connection.close();

            console.log('MongoDB connection closed');
        } catch (error) {
            console.error(
                'Error closing MongoDB connection:',
                error
            );
        } finally {
            process.exit(0);
        }
    });

    setTimeout(() => {
        console.error(
            'Forced shutdown after timeout'
        );

        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', () => {
    gracefulShutdown('SIGTERM');
});

process.on('SIGINT', () => {
    gracefulShutdown('SIGINT');
});