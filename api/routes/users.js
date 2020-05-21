
const express = require('express');
const router = express.Router();

const users = require('../calls/users');

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


module.exports = router;
