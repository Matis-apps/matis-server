const express = require('express');
const app = express();
const cors = require('cors');
const passport_access = require('passport');
const passport_refresh = require('passport');
const utils = require('./utils');
const morgan = require('morgan');
const moment = require('moment');
const cookieParser = require('cookie-parser');

// Database
require('./config/database');
require('./models/user');
require('./models/config');
require('./models/discogs_collection');

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
var whitelist = ['https://dev.my-matis.com', 'https://my-matis.com', process.env.APP_URL];
var corsOptions = {
  origin: function (origin, callback) {
    if (whitelist.indexOf(origin) !== -1) {
      callback(null, true)
    } else {
      callback(utils.error('Not allowed by CORS', 401))
    }
  },
  credentials: true
};
app.use(cors(corsOptions));

// Ease to parse cookies
app.use(cookieParser());

// Quick fonction to print connection details
app.use((req, res, next) => {
  const client_ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  console.log('New connection from ' + client_ip + ' at ' + moment().toString());
  next();
})

// Routes
const authRoutes = require('./api/routes/auth')
const usersRoutes = require('./api/routes/users')
const deezerRoutes = require('./api/routes/deezer')
const spotifyRoutes = require('./api/routes/spotify')
const meSpotifyRoutes = require('./api/routes/meSpotify')
const discogsRoutes = require('./api/routes/discogs')
const toolRoutes = require('./api/routes/tool')

const passportMiddleware = passport_access.authenticate('jwt_access_token', {session: false});
const refreshTokenMiddleware = require('./api/middleware/addRefreshToken');
const globalSpotifyMiddleware = require('./api/middleware/globalSpotify');

app.use('/auth', authRoutes);
app.use(passportMiddleware);
app.use(refreshTokenMiddleware);

app.use('/users', usersRoutes);
app.use('/tool', globalSpotifyMiddleware, toolRoutes);
app.use('/deezer', require('./api/middleware/isDeezer'), deezerRoutes);
app.use('/spotify/me', require('./api/middleware/isSpotify'), meSpotifyRoutes);
app.use('/spotify', globalSpotifyMiddleware, spotifyRoutes);
app.use('/discogs', require('./api/middleware/isDiscogs'), discogsRoutes);

// No route found, return an error
app.use((req, res, next) => {
  next(utils.error('Route '+req.originalUrl+' not found', 404));
})

app.use((error,  req, res, next) => {
  console.error("!!! ERROR !!!!")
  if(error.stack) console.error(error.stack)
  else console.error(error.message)
  res.status(error.code || 500).json({
    error : {
      code: error.code,
      message: error.message
    }
  })
})

module.exports = app;
