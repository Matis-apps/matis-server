const express = require('express');
const router = express.Router();

const users = require('../src/users');

router.get('/me', (req, res, next) => {
  users.me(req).then(data => {
    res.status(200).json({
      data,
    })
  }).catch(err => next(err));
});

router.get('/accounts', (req, res, next) => {
  users.accounts(req).then(data => {
    res.status(200).json({
      data,
    })
  }).catch(err => next(err));
});

router.get('/token/deezer', (req, res, next) => {
  var code = req.query.code;

  if (code) {
    users.registerDeezer(req, code).then(data => {
      res.status(200).json({
        data,
      })
    }).catch(err => next(err));
  } else {
    next(utils.error("Missing code", 400))
  }
});

module.exports = router;
