const express = require('express');
const router = express.Router();

const deezer = require('../src/deezer');


router.get('/me/releases', (req, res, next) => {
  deezer.getMyReleases(req.deezer_token).then(data => {
    res.status(200).json({
      'data': data,
      'genres': data.genres,
      'count': data.length,
    })
  }).catch(err => next(err));
});

router.get('/releases/:friend_id', (req, res, next) => {
  const friend_id = req.params.friend_id;
  deezer.getReleases(friend_id, req.deezer_token).then(data => {
    res.status(200).json({
      'data': data,
      'genres': data.genres,
      'count': data.length,
    })
  }).catch(err => next(err));
});

router.get('/release/:obj([a-z]+)/:id([0-9]+)', (req, res, next) => {
  const obj = req.params.obj;
  const id = req.params.id;
  deezer.getReleaseContent(obj, id).then(data => {
    res.status(200).json({
      'data': data,
    })
  }).catch(err => next(err));
});

router.get('/artist/:artist_id/related', (req, res, next) => {
  const id = req.params.artist_id;
  deezer.getRelatedArtists(id).then(data => {
    res.status(200).json({
      'data': data,
      'count': data.length,
    })
  }).catch(err => next(err));
});

router.get('/me/social', (req, res, next) => {
  deezer.getSocialFriends('me', req.deezer_token).then(data => {
    res.status(200).json({
      'data': data,
      'countFollowers': data.followers ? data.followers.length : 0,
      'countFollowings': data.followings ? data.followings.length : 0,
    })
  }).catch(err => next(err));
});

module.exports = router;