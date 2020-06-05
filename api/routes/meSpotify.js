const express = require('express');
const router = express.Router();
const spotify = require('../src/spotify');
const utils = require('../../utils');


router.get('/releases', (req, res, next) => {
  spotify.getMyReleases(req.spotify_token, req.spotify_username).then(data => {
    res.status(200).json({
      'data': data,
      'genres': data.genres,
      'count': data.length,
    })
  }).catch(err => next(err));
});

/*
router.get('/social', (req, res, next) => {
  spotify.getSocialFriends('me', req.deezer_token).then(data => {
    res.status(200).json({
      'data': data,
      'countFollowers': data.followers ? data.followers.length : 0,
      'countFollowings': data.followings ? data.followings.length : 0,
    })
  }).catch(err => next(err));
});
*/


router.get('/playlists', (req, res, next) => {
  spotify.getMyPlaylists(req.spotify_token).then(data => {
    res.status(200).json({
      'data': data,
      'count': data.length,
    })
  }).catch(err => next(err));
});

router.get('/playlist/:id([0-9a-zA-Z]+)/releases', (req, res, next) => {
  const id = req.params.id;
  spotify.getPlaylistArtistRelease(req.spotify_token, id).then(data => {
    res.status(200).json({
      'data': data,
      'count': data.length,
    })
  }).catch(err => next(err));
});


module.exports = router;