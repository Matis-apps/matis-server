const express = require('express');
const router = express.Router();

const deezer = require('../calls/deezer');

const user_id = 16192550;

router.get('/artists', (req, res, next) => {

  deezer.getArtists(16192550)
    .then(data => {
      res.status(200).json({
        'data': data,
        'count': data.length,
      })
    }).catch(err => next(err));
});

router.get('/artist/:id', (req, res, next) => {
  const id = req.params.id;
  deezer.getArtist(id).then(data => {
    console.log(data);
    res.status(200).json({
      'data': data,
    })
  }).catch(err => next(err));
});

router.get('/playlists', (req, res, next) => {
  deezer.user_id = 16192550;

  deezer.getPlaylists('me').then(data => {
    res.status(200).json({
      'data': data,
      'count': data.length,
    })
  }).catch(err => next(err));
});

module.exports = router;