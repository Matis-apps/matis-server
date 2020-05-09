const express = require('express');
const router = express.Router();

const deezer = require('../calls/deezer');

var user_id = 16192550;

router.get('/artists', (req, res, next) => {
  deezer.getArtists(user_id).then(data => {
    res.status(200).json({
      'data': data,
      'count': data.length,
    })
  }).catch(err => next(err));
});

router.get('/artist/:id', (req, res, next) => {
  const id = req.params.id;
  deezer.getArtist(id).then(data => {
    res.status(200).json({
      'data': data,
    })
  }).catch(err => next(err));
});

router.get('/artist/:id/related', (req, res, next) => {
  const id = req.params.id;
  deezer.getRelatedArtists(id).then(data => {
    res.status(200).json({
      'data': data,
      'count': data.length,
    })
  }).catch(err => next(err));
});


router.get('/albums/:user_id', (req, res, next) => {
  const user_id = req.params.user_id;
  deezer.getAlbums(user_id).then(data => {
    res.status(200).json({
      'data': data,
      'count': data.length,
    })
  }).catch(err => next(err));
});

router.get('/playlists', (req, res, next) => {
  deezer.getPlaylists(user_id).then(data => {
    res.status(200).json({
      'data': data,
      'count': data.length,
    })
  }).catch(err => next(err));
});


router.get('/releases', (req, res, next) => {
  deezer.getMyReleases(user_id).then(data => {
    res.status(200).json({
      'data': data,
      'count': data.length,
    })
  }).catch(err => next(err));
});

router.get('/releases/:user_id', (req, res, next) => {
  const user_id = req.params.user_id;
  deezer.getReleases(user_id).then(data => {
    res.status(200).json({
      'data': data,
      'count': data.length,
    })
  }).catch(err => next(err));
});

module.exports = router;