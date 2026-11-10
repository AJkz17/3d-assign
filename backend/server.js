require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const pool = require('./db');

const PORT = process.env.PORT || 3030;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const BACKEND_URL = process.env.BACKEND_URL || `http://localhost:${PORT}`;

const app = express();
app.set('trust proxy', 1); // needed in production behind a proxy/host

// Allow the Next.js frontend to call this API with cookies
app.use(cors({ origin: FRONTEND_URL, credentials: true }));

// Sessions stored in PostgreSQL
app.use(session({
  store: new pgSession({ pool, tableName: 'session' }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  },
}));

// Google strategy: login AND register happen here
passport.use(new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${BACKEND_URL}/auth/google/callback`,
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value;

      const { rows } = await pool.query(
        `INSERT INTO users (google_sub, email, name)
         VALUES ($1, $2, $3)
         ON CONFLICT (google_sub) DO UPDATE
           SET email = EXCLUDED.email,
               name = EXCLUDED.name
         RETURNING id, email, name`,
        [profile.id, email, profile.displayName]
      );
      done(null, rows[0]);
    } catch (err) {
      done(err);
    }
  }
));

// Store only the user id in the session
passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser(async (id, done) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, email, name FROM users WHERE id = $1', [id]
    );
    done(null, rows[0] || false);
  } catch (err) {
    done(err);
  }
});

app.use(passport.initialize());
app.use(passport.session());

// Middleware to protect routes
function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Not logged in' });
}

// Start Google login
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

// Google sends the user back here
app.get('/auth/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${FRONTEND_URL}/?error=1`, // login page is "/"
  }),
  (req, res) => res.redirect(`${FRONTEND_URL}/dashboard`)
);

app.post('/auth/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => res.redirect(FRONTEND_URL));
  });
});

// Current user (the frontend calls this)
app.get('/api/me', requireAuth, (req, res) => res.json(req.user));

app.listen(PORT, () => console.log(`Backend running on ${BACKEND_URL}`));
