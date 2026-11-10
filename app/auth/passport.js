const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const pool = require('../db');

passport.use(new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/auth/google/callback',
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