const https = require('https');
const sleep = require('await-sleep');
const moment = require('moment');
const utils = require('../../utils');

const CALL_LIMIT = 100; // Limit of items to retrieve
const RETRY_LIMIT = 8; // Limit number of retry
const RETRY_TIMEOUT = 1800; // Limit number of retry
const DIE_TIMEOUT = 10000; // Limit number of retry

/**
 * httpsCall Call the API end parsel de response
 * @params options
 */
function httpsCall(options) {
  return new Promise((resolve, reject) => {
    console.info('** REQUEST ** : ' + options.hostname + options.path);
    setTimeout(() => reject(utils.error('Deezer : Timeout after 10s', 408)), DIE_TIMEOUT);
    var req = https.get(options, response => {
      // Event when receiving the data
      var responseBody = "";
      response.on('data', function(chunck) { responseBody += chunck });

      // Event when the request is ending
      response.on('end', () => {
        console.info('** RESPONSE ** : ' + options.hostname + options.path + ' : ' + response.statusCode + (responseBody ? ' => ' + responseBody.substr(0,50) + ' ...' : ''));
        if (response.statusCode === 200) {
          try {
            let json = JSON.parse(responseBody)
            if (!json) { // json is undefined or null
              reject(utils.error("Deezer : Unvalid json", 500));
            } else if (json.error) { // json has an error (set by Deezer)
              let code = json.error.code == 4 ? 429
                       : json.error.code == 200 ? 403
                       : json.error.code == 300 ? 403 // Maybe not the best practice, but says that the access is forbidden as the token expired
                       : json.error.code == 500 || json.error.code == 501 || json.error.code == 600 ? 400
                       : json.error.code == 700 ? 503
                       : json.error.code == 800 ? 404
                       : json.error.code;

              //console.error("Deezer : " + json.error.message, code)
              reject(utils.error("Deezer : " + json.error.message, code));
            } else { // otherwise, json is ok
              resolve(json)
            }
          } catch(err) {
            console.warn(err.message);
            reject(utils.error("Deezer : " + err.message, 500));
          }
        } else {
          console.warn(responseBody);
          reject(utils.error("Deezer : " + responseBody, response.statusCode));
        }
      })
    })
    .on('error', (err) => reject(utils.error("Deezer : " + err.message, 500)));
  })
}

function genericHttps(access_token, path) {
  return new Promise(async (resolve, reject) => {
    var result = null;
    var error = null;
    var retry = RETRY_LIMIT;

    // get the general data of the artist
    do {
      const options = {
          hostname: 'api.deezer.com',
          path: path + (access_token ? '?access_token=' + access_token : '' ),
          method: 'GET',
          headers: {
            'content-type': 'text/json'
          },
        };

      try {
        result = await httpsCall(options); // await for the response
      } catch(err) {
        error = err;
        if(error.code == 429) retry-- && await sleep(RETRY_TIMEOUT);// code 429 == quota limit
        else retry = 0;
      }
    } while (!result && retry > 0); // loop while there is another page

    if (result) resolve(result);
    else if (error) reject(error);
    else reject(utils.error("Something went wrong..."));
  })
}

function recursiveHttps(access_token, path) {
  return new Promise((resolve, reject) => {
    var result = [];
    /**
     * recursive Fill the result array and handle the pagination recursively
     * @params index
     * @params retry
     */
    let recursive = async function (index = 0, retry = RETRY_LIMIT) {
      // Configuration of the https request
      const options = {
        hostname: 'api.deezer.com',
        path: path + 'index=' + index + '&limit=' + CALL_LIMIT + (access_token ? '&access_token=' + access_token : '' ),
        method: 'GET',
        headers: {
          'content-type': 'text/json'
        },
      };

      try {
        let response = await httpsCall(options);
        Array.prototype.push.apply(result, response.data)
        if(response.next) { // if has a next object, keep going
          recursive(index+CALL_LIMIT)
            .catch(() => resolve(result)); // resolve the iterations if an error happens
        } else { // no more page, resolve with the result
          resolve(result);
        }
      } catch(error) {
        if (retry > 0 && error.code == 429) { // too many request and still have a retry, so wait for a delay and get back
          setTimeout(recursive, RETRY_TIMEOUT, index, retry-1);
        } else {
          reject(utils.error(error.message || 'Something went wrong...', error.code || 500));
        }
      }
    };

    setTimeout(() => {
      if (result.length > 0) resolve(result);
      else reject(utils.error("Waiting 1 minute and still no data ...", 500));
    }, 60000) // 1 minutes

    recursive()
  })
}

////////////////
// FETCH DATA //
////////////////

/**
 * fetchArtists
 * @params user_id
 * @params access_token
 */
function fetchArtists(access_token, user_id) {
  return new Promise((resolve, reject) => {
    const path = '/user/' + user_id + '/artists?access_token=' + access_token + '&';
    recursiveHttps(access_token, path)
      .then(result => resolve(result))
      .catch(error => reject(error))
  });
}

/**
 * fetchArtist
 * @params id
 */
function fetchArtist(access_token, id) {
  return new Promise((resolve, reject) => {
    const path = '/artist/' + id;
    genericHttps(access_token, path)
    .then(artist => {
      fetchArtistAlbums(access_token, id) // await for the response
      .then(artistAlbums => {
        artist.albums = artistAlbums.sort((a,b) => sortAlbums(a,b));
        resolve(artist);
      }).catch(error => reject(error));
    }).catch(error => reject(error));
  });
}

/**
 * fetchArtistAlbums
 * @params artist_id
 * @params access_token
 */
function fetchArtistAlbums(access_token, artist_id) {
  return new Promise((resolve, reject) => {
    const path = '/artist/' + artist_id + '/albums?';
    recursiveHttps(access_token, path)
      .then(result => resolve(result))
      .catch(error => reject(error));
  });
}

/**
 * fetchRelatedArtists
 * @params artist_id
 * @params access_token
 */
function fetchRelatedArtists(access_token, artist_id) {
  return new Promise((resolve, reject) => {
    const path = '/artist/' + artist_id + '/related';
    genericHttps(access_token, path)
      .then(result => resolve(result))
      .catch(error => reject(error));
  });
}

/**
 * fetchAlbums
 * @params user_id
 * @params access_token
 */
function fetchAlbums(access_token, user_id = 'me') {
  return new Promise((resolve, reject) => {
    const path = '/user/' + user_id + '/albums?';
    recursiveHttps(access_token, path)
      .then(result => resolve(result))
      .catch(error => reject(error));
  });
}

/**
 * fetchAlbum
 * @params id
 */
function fetchAlbum(access_token, id) {
  return new Promise((resolve, reject) => {
    const path = '/album/'+id;
    genericHttps(access_token, path)
      .then(result => resolve(result))
      .catch(error => reject(error))
  });
}

/**
 * fetchAlbumTracks
 * @params id
 */
function fetchAlbumTracks(access_token, id) {
  return new Promise((resolve, reject) => {
    const path = '/album/'+id+'/tracks?';
    recursiveHttps(access_token, path)
      .then(result => resolve(result))
      .catch(error => reject(error));
  });
}

/**
 * fetchPlaylists
 * @params user_id
 * @params access_token
 */
function fetchPlaylists(access_token, user_id = 'me') {
  return new Promise((resolve, reject) => {
    const path = '/user/' + user_id + '/playlists?';
    recursiveHttps(access_token, path)
      .then(result => resolve(result))
      .catch(error => reject(error));
  });
}

/**
 * fetchPlaylist Return the artist content with its albums
 * @params id
 */
function fetchPlaylist(access_token, id) {
  return new Promise((resolve, reject) => {
    const path = '/playlist/'+id;
    genericHttps(access_token, path)
      .then(result => resolve(result))
      .catch(error => reject(error));
  });
}

function fetchPlaylistContent(access_token, id) {
  return new Promise((resolve, reject) => {
    const path = '/playlist/'+id+'/tracks?';
    recursiveHttps(access_token, path)
      .then(result => resolve(result))
      .catch(error => reject(error));
  });
}

/**
 * fetchTrack
 * @params id
 */
function fetchTrack(access_token, id) {
  return new Promise((resolve, reject) => {
    const path = '/track/'+id;
    genericHttps(access_token, path)
      .then(result => resolve(result))
      .catch(error => reject(error));
  });
}

/**
 * fetchFollowings
 * @params user_id
 * @params access_token
 */
function fetchFollowings(access_token, user_id) {
  return new Promise((resolve, reject) => {
    const path = '/user/' + user_id + '/followings?';
    recursiveHttps(access_token, path)
      .then(result => resolve(result))
      .catch(error => reject(error));
  });
}

/**
 * fetchFollowings
 * @params user_id
 * @params access_token
 */
function fetchFollowers(access_token, user_id) {
  return new Promise((resolve, reject) => {
    const path = '/user/' + user_id + '/followers?';
    recursiveHttps(access_token, path)
      .then(result => resolve(result))
      .catch(error => reject(error));
  });
}

function fetchSearch(type, query, strict) {
  return new Promise((resolve, reject) => {
    const path = '/search/'+type+'?q='+encodeURIComponent(query)+(strict == false ? '&sort=ranking':'');
    genericHttps(null, path)
      .then(result => resolve(result))
      .catch(error => reject(error));
  });
}

//////////////
// SERVICES //
//////////////

/**
 * getArtists
 * @params user_id
 * @params access_token
 */
async function getArtists(access_token, user_id = 'me') {
  try {
    const artists = await fetchArtists(access_token, user_id);
    return artists
      .map(artist => formatArtistToStandard(artist));
  } catch (err) {
    return Promise.reject(err);
  }
}

/**
 * getArtist
 * @params id
 */
async function getArtist(access_token, artist_id) {
  try {
    const artist = await fetchArtist(access_token, artist_id);
    return formatArtistToStandard(artist);
  } catch (err) {
    return Promise.reject(err);
  }
}

/**
 * getRelatedArtists
 * @params id
 */
async function getRelatedArtists(access_token, id) {
  try {
    var relatedArtistsList = await fetchRelatedArtists(access_token, id);
    var relatedArtists = await Promise.all(relatedArtistsList.data.map(artist => fetchArtist(access_token, artist.id).catch(err => console.log(err))));
    return relatedArtists
      .filter(artist => artist && artist.albums && artist.albums.length > 0)
      .map(artist => formatArtistToFeed(artist))
      .sort((a,b) => sortLastReleases(a,b));
  } catch (err) {
    return Promise.reject(err);
  }
}

/**
 * getAlbums
 * @params user_id
 * @params access_token
 */
async function getAlbums(access_token, user_id = 'me') {
  try {
    var albums = await fetchAlbums(access_token, user_id);
    return albums
      .map(album => formatAlbumToFeed(album));
  } catch (err) {
    return Promise.reject(err);
  }
}

/**
 * getAlbumTracks
 * @params user_id
 * @params access_token
 */
async function getAlbumTracks(access_token, album_id) {
  try {
    var tracks = await fetchAlbumTracks(access_token, album_id);
    return tracks
      .map(track => formatTrackToStandard(track, { albumId: album_id, albumName: '<Undefined>' } ))
  } catch (err) {
    return Promise.reject(err);
  }
}

/**
 * getAlbum
 * @params user_id
 * @params access_token
 */
async function getAlbum(access_token, album_id) {
  try {
    var album = await fetchAlbum(access_token, album_id);
    return formatAlbumToStandard(album);
  } catch (err) {
    return Promise.reject(err);
  }
}


/**
 * getMyReleases
 * @params user_id
 * @params access_token
 */
async function getMyReleases(access_token, user_id) {
  var releases = [];
  var error = [];

  const artists = await fetchArtists(access_token, 'me').catch(err => error.push(err));
  if(artists && artists.length > 0) {
    var artistsDetails = await Promise.all(artists.map(i => fetchArtist(access_token, i.id).catch(err => error.push(err))))
    Array.prototype.push.apply(
      releases,
      artistsDetails
        .filter(artist => artist && artist.albums && artist.albums.length > 0)
        .map(artist => formatArtistToFeed(artist))
    )
  }

  var genres = [];
  genres.push({key: -42, value: "Tous"})
  if(releases && releases.length > 0) {
    var availableGenres = [...new Set(releases.map(i => i.content.genre))];
    const call = await getGenres(access_token).catch(err => error.push(err));
    if(call && call.length > 0) {
      availableGenres.forEach(item => {
        let existingGenre = call.find(g => g.id == item);
        if(existingGenre) {
          genres.push({key: existingGenre.id, value: existingGenre.name})
        }
      })
    }
  }
  releases.genres = genres;

  const playlists = await fetchPlaylists(access_token, 'me').catch(err => error.push(err));
  if(playlists && playlists.length > 0) {
    Array.prototype.push.apply(
      releases,
      playlists
        .filter(playlist => playlist && !playlist.is_loved_track && playlist.creator.id != user_id)
        .map(playlist => formatPlaylistToFeed(playlist))
    )
  }

  return new Promise((resolve, reject) => {
    if (releases.length == 0) {
      if (error.length > 0) reject(error[error.length-1]);
      else reject(utils.error("No content"), 404);
    }
    else resolve(releases.sort((a,b) => sortLastReleases(a,b)))
  });
}


async function getPlaylistArtistRelease(access_token, id) {
  try {
    var playlists = await fetchPlaylistContent(access_token, id);
    var artists = [];
    playlists.forEach(item => {
      let artist = item.artist;
      var existingArtist = artists.find(testArtist => testArtist.id == artist.id)
      if (!existingArtist) {
        artists.push(artist)
      }
    })
    var newReleases = await Promise.all(artists.map(i => fetchArtist(access_token, i.id).catch(err => console.log(err))));

    return newReleases
      .filter(release => release && release.albums && release.albums.length > 0)
      .map(release => formatArtistToFeed(release))
      .sort((a,b) => sortLastReleases(a,b));
  } catch (err) {
    return Promise.reject(err);
  }
}

/**
 * getReleases
 * @params user_id
 * @params access_token
 */
async function getReleases(access_token, user_id) {
  var releases = [];
  var error = [];

  const artists = await fetchArtists(access_token, user_id).catch(err => error = err);
  if(artists && artists.length > 0) {
    var artistsDetails = await Promise.all(artists.map(i => fetchArtist(access_token, i.id).catch(err => error.push(err))))
    Array.prototype.push.apply(
      releases,
      artistsDetails
        .filter(artist => artist && artist.albums && artist.albums.length > 0)
        .map(artist => formatArtistToFeed(artist))
    )
  }

  var genres = [];
  genres.push({key: -42, value: "Tous"})
  if(artists && artists.length > 0) {
    var availableGenres = [...new Set(releases.map(i => i.content.genre))];
    const call = await getGenres(access_token).catch(err => error.push(err));
    if(call && call.length > 0) {
      availableGenres.forEach(item => {
        let existingGenre = call.find(g => {
          return g.id == item;
        });
        if(existingGenre) {
          genres.push({key: existingGenre.id, value: existingGenre.name})
        }
      })
    }
  }
  releases.genres = genres;

  const playlists = await fetchPlaylists(access_token, user_id).catch(err => error.push(err));
  if(playlists && playlists.length > 0) {
    Array.prototype.push.apply(
      releases,
      playlists.map(playlist => formatPlaylistToFeed(playlist))
    );
  }

  const albums = await fetchAlbums(access_token, user_id).catch(err => error.push(err));
  if(albums && albums.length > 0) {
    Array.prototype.push.apply(
      releases,
      albums
        .filter(album => !releases.map(release => release.content.type+'-'+release.content.id).includes(album.record_type+'-'+album.id))
        .map(album => formatAlbumToFeed(album))
    );
  }

  return new Promise((resolve, reject) => {
    if (releases.length == 0) {
      if (error.length > 0) reject(error[error.length-1]);
      else reject(utils.error("No content"), 404);
    }
    else resolve(releases.sort((a,b) => sortLastReleases(a,b)));
  });
}

/**
 * getReleaseContent
 * @params obj
 * @params id
 */
async function getReleaseContent(access_token, obj, id) {
  try {
    if(obj === 'album') {
      var album = await fetchAlbum(access_token, id);
      if (album) return formatAlbumToFeed(album);
      else throw utils.error('No album', 404);
    } else if (obj === 'playlist') {
      var playlist = await fetchPlaylist(access_token, id);
      if (playlist) {
        playlist = formatPlaylistToFeed(playlist);
        var tracks = await fetchPlaylistContent(access_token, id);
        if (tracks) playlist.content.tracks = tracks.map(track => formatTrackToStandard(track));
        return playlist;
      } else {
        throw utils.error('No playlist', 404);
      }
    } else {
      throw utils.error('Not supported release object', 400);
    }
  } catch(err) {
    return Promise.reject(err);
  }
}

/**
 * getGenres
 * @params id
 */
function getGenres(access_token) {
  return new Promise((resolve, reject) => {
    const path = '/genre';
    genericHttps(access_token, path)
      .then(result => resolve(result.data))
      .catch(error => reject(error));
  });
}

function getMeAccount(access_token) {
  return new Promise((resolve, reject) => {
    const path = '/user/me';
    genericHttps(access_token, path)
      .then(result => resolve(result))
      .catch(error => reject(error));
  });
}

/**
 * getSocialFriends
 * @params id
 */
async function getSocialFriends(user_id, access_token) {
  // retrieve the general content
  try {
    let social = {
      followers: [],
      followings: [],
    };
    const followers = await fetchFollowers(user_id, access_token).catch(err => {throw err});
    if (followers && followers.length ) {
      social.followers = response.map(i => formatUserToStandard(i)).sort((a,b) => sortFriends(a,b));
    }

    const followings = await fetchFollowings(user_id, access_token).catch(err => {throw err});
    if (followings && following.length > 0) {
      social.followings = response.map(i => formatUserToStandard(i)).sort((a,b) => sortFriends(a,b));
    }
    return social;
  } catch(err) {
    return Promise.reject(err);
  }
}

async function getSearch(query, types = "*", strict = false) {
  const allowedTypes = ['artist', 'album', 'playlist', 'track', 'user'];
  var search_types = [];
  var results = new Object;
  var error;

  if (types == "*") {
    search_types = allowedTypes;
  } else {
    if (types.includes(",")) {
      search_types = allowedTypes.filter(i => types.split(",").includes(i));
    } else {
      search_types = allowedTypes.filter(item => item == types);
    }
  }

  if (search_types.length > 0) {
    await utils.asyncForEach(search_types, async (type) => {
      await fetchSearch(type, query, strict)
        .then(async (result) => {
          if (strict && result.data) {
            result.data = result.data.filter(item => query.toUpperCase().includes(item.name ? item.name.toUpperCase() : item.title.toUpperCase()));
          }
          switch(type) {
            case 'artist':
              results.artists = result.data.map(i => formatArtistToStandard(i));
              break;
            case 'album':
              await Promise
                .all(result.data.map(i => fetchAlbum(null, i.id).catch(err => error = err)))
                .then(albums => {
                  results.albums = albums.map(i => formatAlbumToStandard(i));
                }).catch(err => error = err);
              break;
            case 'playlist':
              results.playlists = result.data.map(i => formatPlaylistToStandard(i));
              break;
            case 'track':
              await Promise
                .all(result.data.map(i => fetchTrack(null, i.id).catch(err => error = err)))
                .then(tracks => {
                  results.tracks = tracks.map(i => formatTrackToStandard(i));
                }).catch(err => error = err);
              break;
            case 'user':
              results.users = result.data.map(i => formatUserToStandard(i));
              break;
          }
        })
    })
  } else {
    error = utils.error("Bad t paramater", 400)
  }

  return new Promise((resolve, reject) => {
    if (Object.keys(results).length == 0) {
      if (error) reject(error);
      else reject(utils.error("No content", 404));
    }
    else resolve(results)
  })
}

function searchAlbumUPC(query, upc) {
  return new Promise(async (resolve, reject) => {
    var album = null;
    var error = null;
    var index = 0;
    var limit = CALL_LIMIT/2; // improve the performances due to fullAlbums.filter
    var total = limit;

    var albums, fullAlbums;
    do {
      albums = null;
      fullAlbums = null;
      const path = '/search/album?limit=' + limit + '&index=' + index + '&q='+encodeURIComponent(utils.removeParentheses(query));
      try {
        albums = await genericHttps(null, path);
        if(albums && albums.data) {
          total = albums.total;
          try {
            fullAlbums = await Promise.all(albums.data.map(i => fetchAlbum(null, i.id)));
            //fullAlbums = await Promise.all(albums.data.filter(i => utils.checkSize(query, i.title)).map(i => fetchAlbum(i.id)));
          } finally {
            if (fullAlbums) {
              album = fullAlbums.find(a => utils.isSameUPC(a.upc, upc));
              album = album ? formatAlbumToStandard(album) : null;
            } else {
              throw utils.error("Invalid data", 500)
            }
          }
        } else {
          throw utils.error("Invalid data", 500)
        }
      } catch(err) {
        error = err;
      } finally {
        index+=limit;
      }
    } while (!album && total > index)

    if(!album) {
      index = 0;
      do {
        albums = null;
        fullAlbums = null;
        const path = '/search?limit=' + limit + '&index=' + index + '&q='+encodeURIComponent(utils.removeParentheses(query));
        try {
          albums = await genericHttps(null, path);
          if(albums && albums.data) {
            total = albums.total;
            try {
              fullAlbums = await Promise.all(albums.data.filter(i => !!i.album).map(i => fetchAlbum(null, i.album.id).catch(err => error = err)));
              //fullAlbums = await Promise.all(albums.data.filter(i => utils.checkSize(query, i.title)).map(i => fetchAlbum(i.id)));
            } finally {
              if (fullAlbums) {
                album = fullAlbums.find(a => utils.isSameUPC(a.upc, upc));
                album = album ? formatAlbumToStandard(album) : null;
              } else {
                throw utils.error("Invalid data", 500)
              }
            }
          } else {
            throw utils.error("Invalid data", 500)
          }
        } catch(err) {
          error = err;
        } finally {
          index+=limit;
        }
      } while (!album && total > index)
    }

    if (album) resolve(album);
    else if (error) reject(error);
    else reject(utils.error("Not found", 200));
  });
}


function searchTrackISRC(query, isrc) {
  return new Promise(async (resolve, reject) => {
    var track = null;
    var error = null;
    var index = 0;
    var limit = CALL_LIMIT/2; // improve the performances due to fullAlbums.filter
    var total = limit;

    var tracks, fullTracks;
    do {
      tracks = fullTracks = null;
      const path = '/search/track?limit=' + limit + '&index=' + index + '&q='+encodeURIComponent(query);

      try {
        tracks = await genericHttps(null, path);
        if(tracks && tracks.data) {
          total = tracks.total;
          try {
            fullTracks = await Promise.all(tracks.data.map(i => fetchTrack(null, i.id)))
          } finally {
            if (fullTracks) {
              track = fullTracks.find(t => t.isrc == isrc);
              track = track ? formatTrackToStandard(track) : null;
            } else {
              throw utils.error("Invalid data", 500)
            }
          }
        } else {
          throw utils.error("Invalid data", 500)
        }
      } catch(err) {
        error = err;
      } finally {
        index+=limit;
      }
    } while (!track && total > index)

    if (track) resolve(track)
    else if (error) reject(error)
    else reject(utils.error("Not found", 200))
  });
}

async function getMyPlaylists(access_token) {
  try {
    const playlists = await fetchPlaylists(access_token, 'me');
    if (playlists && playlists.length > 0) {
      return playlists.map(playlist => formatPlaylistToStandard(playlist));
    } else {
      throw utils.error('No playlists', 404)
    }
  } catch(err) {
    return Promise.reject(err);
  }
}

////////////////////////
// FORMAT TO STANDARD //
////////////////////////
function formatArtistToStandard(artist) {
  return {
    _obj: 'artist',
    _from: 'deezer',
    _uid: 'deezer-'+artist.type+'-'+artist.id,
    // Related to the author
    id: artist.id,
    name: artist.name,
    picture: artist.picture ? artist.picture : null,
    link: artist.link ? artist.link : "https://www.deezer.com/artist/"+artist.id,
    albums: artist.albums ? artist.albums.data.map(i => formatAlbumToStandard(i)) : null,
    nb_albums: artist.nb_album ? artist.nb_album : null,
    nb_fans: artist.nb_fan ? artist.nb_fan : null,
    added_at: artist.time_add ? timestampToDate(artist.time_add) : null,
  };
}

function formatAlbumToStandard(album){
  var artists = [];
  if (album.artist) {
    artists.push(formatArtistToStandard(album.artist));
    if (album.contributors) {
      var contributors = album.contributors ? album.contributors.map(i => formatArtistToStandard(i)) : [];
      artists = [... contributors];
    }
  }

  return {
    _obj: 'album',
    _from: 'deezer',
    _uid: 'deezer-'+album.record_type+'-'+album.id,
    // Related to the author
    id: album.id,
    name: album.title,
    type: album.record_type,
    picture: album.cover,
    link: album.link,
    upc: album.upc || null,
    nb_tracks: album.nb_tracks,
    artists: artists,
    updated_at: album.release_date,
    added_at: album.time_add ? timestampToDate(album.time_add) : null,
  };
}

function formatPlaylistToStandard(playlist){
  return {
    _obj: 'playlist',
    _from: 'deezer',
    _uid: 'deezer-'+playlist.type+'-'+playlist.id,
    // Related to the author
    id: playlist.id,
    name: playlist.title,
    description: playlist.description,
    picture: playlist.picture,
    link: playlist.link,
    updated_at: playlist.time_mod ? timestampToDate(playlist.time_mod) : null,
    added_at: playlist.time_add ? timestampToDate(playlist.time_add) : null,
  };
}

function formatTrackToStandard(track, { albumId = -1, albumName = '<Undefined>' } = {}){
  var artists = [];
  if (track.artist) {
    artists.push(formatArtistToStandard(track.artist));
    if (track.contributors) {
      const contributors = track.contributors.map(artist => formatArtistToStandard(artist));
      artists = [... contributors];
    }
  }

  return {
    _obj: 'track',
    _from: 'deezer',
    _uid: 'deezer-'+track.type+'-'+track.id,
    // Related to the author
    id: track.id,
    name: track.title,
    link: track.link,
    isrc: track.isrc||null,
    preview: track.preview,
    duration: track.duration ? timestampToTime(track.duration) : '00:00',
    updated_at: track.time_add ? timestampToDate(track.time_add) : track.album ? track.album.release_date : null,
    artists: artists,
    album: {
      id: track.album ? track.album.id : albumId,
      name: track.album ? track.album.title : albumName,
    }
  };
}

function formatUserToStandard(user){
  return {
    _obj: 'user',
    _from: 'deezer',
    _uid: 'deezer-'+user.type+'-'+user.id,
    // Related to the author
    id: user.id,
    name: user.name,
    profile: user.link,
    fullname: user.firstname && user.lastname ? user.firstname + ' ' + user.lastname : null,
    picture: user.picture,
  };
}

//////////////////////////////
// FORMAT TO FEED (RELEASE) //
//////////////////////////////
function formatArtistToFeed(artist){
  if (artist.albums && artist.albums.length > 0) {
    const firstAlbum = artist.albums[0];
    return {
      _obj: 'album',
      _from: 'deezer',
      _uid: 'deezer-'+firstAlbum.record_type+'-'+artist.id+'-'+firstAlbum.id,
      // Related to the author
      author: {
        id: artist.id,
        name: artist.name,
        picture: artist.picture_small,
        link: artist.link,
        added_at: artist.time_add ? timestampToDate(artist.time_add) : null,
      },
      // Related to the content
      content: {
        id: firstAlbum.id,
        title: firstAlbum.title,
        type: firstAlbum.record_type,
        description: 'Based on your feed with ' + artist.name,
        picture: firstAlbum.cover_medium,
        link: firstAlbum.link,
        upc: firstAlbum.upc||null,
        genre: firstAlbum.genre_id,
        updated_at: firstAlbum.release_date,
        //last: artist.albums[0],
      }
    };
  }
  return;
}

function formatAlbumToFeed(album) {
  return {
    _obj: 'album',
    _from: 'deezer',
    _uid: 'deezer-'+album.record_type+'-'+album.artist.id+'-'+album.id,
    // Related to the author
    author: {
      id: album.artist.id,
      name: album.artist.name,
      picture: album.artist.picture_small,
      link: "https://www.deezer.com/profile/" + album.artist.id,
      added_at: album.time_add ? timestampToDate(album.time_add) : null,
    },
    // Related to the content
    content: {
      id: album.id,
      title: album.title,
      description: 'Based on an album you liked',
      type: album.record_type,
      picture: album.cover_medium,
      link: album.link,
      upc: album.upc||null,
      genre: album.genre_id,
      updated_at: album.release_date,
      tracks: album.tracks && album.tracks.data && album.tracks.data.length > 0 ? album.tracks.data.map(i => formatTrackToStandard(i, { albumId: album.id, albumName: album.title })) : [],
      //last: album,
    },
  };
}

function formatPlaylistToFeed(playlist) {
  return {
    _obj: 'playlist',
    _from: 'deezer',
    _uid: 'deezer-'+playlist.type+'-'+playlist.creator.id+'-'+playlist.id,
    // Related to the author
    author: {
      id: playlist.creator.id,
      name: playlist.creator.name,
      picture: null,
      link: "https://www.deezer.com/profile/" + playlist.creator.id,
      added_at: playlist.time_add ? timestampToDate(playlist.time_add) : null,
    },
    // Related to the content
    content: {
      id: playlist.id,
      title: playlist.title,
      description: playlist.description,
      type: playlist.type,
      picture: playlist.picture_medium,
      link: playlist.link,
      genre: null,
      updated_at: playlist.time_mod ? timestampToDate(playlist.time_mod)
                : playlist.time_add ? timestampToDate(playlist.time_add)
                : playlist.tracks ? timestampToDate(Math.max.apply(null, playlist.tracks.data.map(i => i.time_add)))
                : null,
      tracks: playlist.tracks ? playlist.tracks.data.map(i => formatTrackToStandard(i)) : null,
      //last: playlist,
    },
  };
}

///////////////
// UTILITIES //
///////////////
function sortLastReleases ( a, b ) {
  if ( a.content == null || a.content.updated_at == null ) return 1;
  if ( b.content == null || b.content.updated_at == null ) return -1;
  if ( a.content.updated_at > b.content.updated_at ) return -1;
  if ( a.content.updated_at < b.content.updated_at ) return 1;
  return 0;
}

function sortAlbums ( a, b ) {
  if ( a.release_date == null ) return 1;
  if ( b.release_date == null ) return -1;
  if ( a.release_date > b.release_date ) return -1;
  if ( a.release_date < b.release_date ) return 1;
  return 0;
}

function sortFriends ( a, b ) {
  if ( a.name == null ) return -1;
  if ( b.name == null ) return 1;
  if ( utils.capitalize(a.name) > utils.capitalize(b.name) ) return 1;
  if ( utils.capitalize(a.name) < utils.capitalize(b.name) ) return -1;
  return 0;
}

function timestampToDate(timestamp) {
  return moment.unix(timestamp).format("YYYY-MM-DD");
}

function timestampToTime(seconds) {
  return moment.unix(seconds).format("mm:ss");
}

exports.getArtists = getArtists;
exports.getRelatedArtists = getRelatedArtists;
exports.getArtist = getArtist;
exports.fetchAlbums = fetchAlbums;
exports.getAlbum = getAlbum;
exports.getMyReleases = getMyReleases;
exports.getReleases = getReleases;
exports.getReleaseContent = getReleaseContent;
exports.getGenres = getGenres;
exports.getMeAccount = getMeAccount;
exports.getSocialFriends = getSocialFriends;
exports.getSearch = getSearch;
exports.searchAlbumUPC = searchAlbumUPC;
exports.searchTrackISRC = searchTrackISRC;
exports.getMyPlaylists = getMyPlaylists;
exports.getPlaylistArtistRelease = getPlaylistArtistRelease;
exports.getAlbumTracks = getAlbumTracks;
