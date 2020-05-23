const express = require('express');
const app = express();
const cors = require('cors');
const passport = require('passport');
const utils = require('./utils');
const morgan = require('morgan');


// Database
require('./config/database');
require('./models/user');

// Pass the global passport object into the configuration function
require('./config/passport')(passport);

// This will initialize the passport object on every request
app.use(passport.initialize());

// Parse JSON bodies (as sent by API clients)
app.use(express.json());

// Local tools
app.use(morgan('dev'));

// Allow CORS from this endpoint
app.use(cors());

// Routes
const authRoutes = require('./api/routes/auth')
const usersRoutes = require('./api/routes/users')
const deezerRoutes = require('./api/routes/deezer')
const spotifyRoutes = require('./api/routes/spotify')

const passportMiddleware = passport.authenticate('jwt', {session: false});

app.use('/auth', authRoutes);
app.use('/users', passportMiddleware, usersRoutes);
app.use('/deezer', passportMiddleware, require('./api/middleware/isDeezer').isDeezer, deezerRoutes);
app.use('/spotify', passportMiddleware, require('./api/middleware/isSpotify').isSpotify, spotifyRoutes);

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
