const express = require('express');
const app = express();
const cors = require('cors');
const passport_access = require('passport');
const passport_refresh = require('passport');
const utils = require('./utils');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');

// Database
require('./config/database');
require('./models/user');

// Pass the global passport object into the configuration function
require('./config/passport')(passport_access);
require('./config/passport-refresh')(passport_refresh);

// This will initialize the passport object on every request
app.use(passport_access.initialize());
app.use(passport_refresh.initialize());

// Parse JSON bodies (as sent by API clients)
app.use(express.json());

// Local tools
app.use(morgan('dev'));

// Allow CORS from this endpoint
app.use(cors({
  origin: process.env.APP_URL,
  credentials: true
}));

// Ease to parse cookies
app.use(cookieParser());

// Routes
const authRoutes = require('./api/routes/auth')
const usersRoutes = require('./api/routes/users')
const deezerRoutes = require('./api/routes/deezer')
const spotifyRoutes = require('./api/routes/spotify')
const toolRoutes = require('./api/routes/tool')

const passportMiddleware = passport_access.authenticate('jwt_access_token', {session: false});
const refreshTokenMiddleware = require('./api/middleware/addRefreshToken').addRefreshToken;

app.use('/auth', authRoutes);
app.use('/users', passportMiddleware, refreshTokenMiddleware, usersRoutes);
app.use('/tool', passportMiddleware, refreshTokenMiddleware, toolRoutes);
app.use('/deezer', passportMiddleware, refreshTokenMiddleware, require('./api/middleware/isDeezer').isDeezer, deezerRoutes);
app.use('/spotify', passportMiddleware, refreshTokenMiddleware, require('./api/middleware/isSpotify').isSpotify, spotifyRoutes);

// No route found, return an error
app.use((req, res, next) => {
  next(utils.error('Route '+req.originalUrl+' not found', 404));
})

app.use((error,  req, res, next) => {
  res.status(error.code || 500).json({
    error : {
      code: error.code,
      message: error.message
    }
  })
})

module.exports = app;
