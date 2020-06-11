const express = require('express');
const router = express.Router();
const users = require('../src/users');
const utils = require('../../utils');

router.get('/me', (req, res, next) => {
  users.me(req).then(async (data) => {
    var discogsToken = null;
    try {
      if (!req.user.discogs) {
        discogsToken = await users.requestTokenDiscogs(req);
      } else {
        throw 'Already have a Discogs account';
      }
    } catch (err) {
      discogsToken = '';
    }
    res.status(200).json({'data': data.user, 'has': data.has, discogsToken})
  }).catch(err => next(err));
});

router.get('/token/deezer', (req, res, next) => {
  var code = req.query.code;

  if (code) {
    users.registerDeezer(req, code).then(data => {
      res.status(200).json(data)
    }).catch(err => next(err));
  } else {
    next(utils.error("Missing code", 400))
  }
});

router.get('/token/spotify', (req, res, next) => {
  var code = req.query.code;

  if (code) {
    users.registerSpotify(req, code).then(data => {
      res.status(200).json(data)
    }).catch(err => next(err));
  } else {
    next(utils.error("Missing code", 400))
  }
});

router.get('/token/discogs', (req, res, next) => {
  var token = req.query.token;
  var verify = req.query.verify;

  if (token && verify) {
    users.registerDiscogs(req, token, verify).then(data => {
      res.status(200).json(data)
    }).catch(err => next(err));
  } else {
    next(utils.error("Missing code", 400))
  }
});

module.exports = router;
