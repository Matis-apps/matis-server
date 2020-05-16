const express = require('express');
const app = express();
const mutils = require('./mutils');
const morgan = require('morgan');

const deezerRoutes = require('./api/routes/deezer')

// Allow CORS from this endpoint
app.use((req, res, next) => {
  let origin = req.headers.origin;
  res.header("Access-Control-Allow-Origin", origin);
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

app.use(morgan('dev'));

app.use('/deezer', deezerRoutes);

// No route found, return an error
app.use((req, res, next) => {
  next(mutils.error('Route '+req.originalUrl+' not found', 404));
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