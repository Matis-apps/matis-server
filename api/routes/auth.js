const express = require('express');
const router = express.Router();
const auth = require('../src/auth');
const utils = require('../../utils');
const passport_refresh = require('passport');

router.post('/login', (req, res, next) => {
  auth.login(req).then(data => {
    res.cookie('refresh_token', data.refresh_token.token, {
      maxAge: data.refresh_token.expires,
      httpOnly: true,
      sameSite: 'none',
      secure: true,
    });
    res.status(200).json({access_token: data.access_token, has: data.has})
  }).catch(err => next(err));
});

router.post('/register', (req, res, next) => {
  auth.register(req).then(data => {
    res.cookie('refresh_token', data.refresh_token.token, {
      maxAge: data.refresh_token.expires,
      httpOnly: true,
      sameSite: 'none',
      secure: true,
    });
    res.status(200).json({access_token: data.access_token, has: data.has})
  }).catch(err => next(err));
});

const passportRefreshMiddleware = passport_refresh.authenticate('jwt_refresh_token', {session: false});

router.get('/token', passportRefreshMiddleware, (req, res, next) => {
  let refresh_token = req.cookies.refresh_token;
  if (refresh_token) {
    auth.token(req, refresh_token).then(data => {
      res.cookie('refresh_token', data.refresh_token.token, {
        maxAge: data.refresh_token.expires,
        httpOnly: true,
        sameSite: 'none',
        secure: true,
      });
      res.status(200).json({access_token: data.access_token, has: data.has})
    }).catch(err => next(err));
  } else {
    next(utils.error("Missing refresh token", 400));    
  }
});

module.exports = router;
