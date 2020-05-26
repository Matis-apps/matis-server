const https = require('https');
const sleep = require('await-sleep');
const moment = require('moment');
const utils = require('../../utils');

const call_limit = 50; // Limit of items to retrieve
const retry_limit = 8; // Limit number of retry
const retry_timeout = 1800; // Limit number of retry

/**
 * httpsCall Call the API end parse de response
 * @params options
 */
const httpsCall = async function(options) {
  return new Promise((resolve, reject) => {
    var req = https.get(options, response => {
      // Event when receiving the data
      var responseBody = "";
      response.on('data', function(chunck) { responseBody += chunck });

      // Event when the request is ending
      response.on('end', () => {
        try {
          let json = JSON.parse(responseBody)
          if (response.statusCode === 200) {
            if (!json) { // json is undefined or null
              reject(utils.error("Unvalid json", 500));
            } else if (json.error) { // json has an error (set by Deezer)
              reject(utils.error(json.error.message, json.error.code));
            } else { // otherwise, json is ok
              resolve(json)
            }
          } else {
            if(json.error) {
              reject(utils.error(json.error.message, response.statusCode));
            } else {
              reject(utils.error("Something went wrong...", 500));
            }
          }
        } catch(e) {
          reject(utils.error(e.message, 500));
        }
      })
    }).on('error', function(e) {
      reject(utils.error(e.message, 500));
    });
  })
}

function genericHttps(access_token, path) {
  return new Promise(async (resolve, reject) => {
    var result = null;
    var error = null;
    var retry = retry_limit;
    
    // get the general data of the artist
    do {
      const options = {
        hostname: 'api.spotify.com',
        path: path,
        method: 'GET',
        headers: {
          'Authorization': 'Bearer '+access_token,
          'content-type': 'text/json'
        },
      };

      try {
        result = await httpsCall(options) // await for the response
      } catch(err) {
        error = err;
        if(error.code == 429) retry-- && await sleep(retry_timeout);// code 4 == quota limit
        else retry = 0;
      }
    } while (!result && retry > 0); // loop while there is another page

    if (result) {
      resolve(result);
    } else if (error) {
      reject(error);
    } else {
      reject(utils.error("Something went wrong..."));
    }
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
    let recursive = async function (index = 0, retry = retry_limit) {
      // Configuration of the https request
      const options = {
        hostname: 'api.spotify.com',
        path: path + 'offset=' + index + '&limit='+call_limit,
        method: 'GET',
        headers: {
          'Authorization': 'Bearer '+access_token,
          'content-type': 'text/json'
        },
      };

      try {
        let response = await httpsCall(options);

        var itemMainKey = Object.keys(response)[0];

        if (response[itemMainKey].items) {
          Array.prototype.push.apply(result, response[itemMainKey].items)
          if(response[itemMainKey].next) { // if has a next object, keep going
            recursive(index+call_limit)
              .catch(() => resolve(result)); // resolve the iterations if an error happens
          } else { // no more page, resolve with the result
            resolve(result);
          }
        } else if (response.items) {
          Array.prototype.push.apply(result, response.items)
          if(response.next) { // if has a next object, keep going
            recursive(index+call_limit)
              .catch(() => resolve(result)); // resolve the iterations if an error happens
          } else { // no more page, resolve with the result
            resolve(result);
          }
        } else {
          throw utils.error("Unvalid data", 500);
        }
      } catch(error) {
        if (retry > 0 && error.code == 429) { // too many request and still have a retry, so wait for a delay and get back
          setTimeout(recursive, retry_timeout, index, retry-1);
        } else {
          reject(utils.error(error.message || "Something went wrong...", error.code || 500));
        }
      }
    };

    recursive()
  })
}

async function getMeAccount(access_token) {
  return new Promise((resolve, reject) => {
    const path = '/v1/me/';
    genericHttps(access_token, path)
      .then(result => {
        resolve(result)
      })
      .catch(error => {
        reject(error)
      })
  });
}

async function fetchSearch(access_token, type, query, strict) {
  return new Promise((resolve, reject) => {
    const path = '/v1/search?type='+type+'&q='+encodeURI(query);
    genericHttps(access_token, path)
      .then(result => {
        resolve(result)
      })
      .catch(error => {
        reject(error)
      })
  });
}

async function getSearch(access_token, query, types = "*", strict = true) {
  const allowedTypes = ['artist', 'album', 'playlist', 'track'];
  var search_types = [];
  var results = [];
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
      await fetchSearch(access_token, type, query, strict)
        .then((result) => {
          switch(type) {
            case 'artist':
              //results.artist = result.artists.items.map(i => formatArtistToStandard(i));
              Array.prototype.push.apply(results, result.artists.items.map(i => formatArtistToStandard(i)));

              break;
            case 'album':
              //results.album = result.albums.items.map(i => formatAlbumToStandard(i));
              Array.prototype.push.apply(results, result.albums.items.map(i => formatAlbumToStandard(i)));
              break;
            case 'playlist':
              //results.playlist = result.playlists.items.map(i => formatPlaylistToStandard(i));
              Array.prototype.push.apply(results, result.playlists.items.map(i => formatPlaylistToStandard(i)));
              break;
            case 'track':
              //results.track = result.tracks.items.map(i => formatTrackToStandard(i));
              Array.prototype.push.apply(results, result.tracks.items.map(i => formatTrackToStandard(i)));
              break;
          }
        })
        .catch(err => error = err)
    })

    if (strict) {
      results = results.filter(item => item.name.toUpperCase().includes(query.toUpperCase()));
      await utils.asyncForEach(search_types, async (type) => {
        switch(type) {
          case 'album':
            await Promise
              .all(results.filter(i => i._obj == 'album').map(i => fetchAlbum(access_token, i.id).catch(err => error = err)))
              .then(albums => {
                results.album = albums.map(i => formatAlbumToStandard(i))
              }).catch(err => error = err);
            break;
          case 'track':
            await Promise
              .all(results.filter(i => i._obj == 'track').map(i => fetchTrack(access_token, i.id).catch(err => error = err)))
              .then(tracks => {
                results.track = tracks.map(i => formatTrackToStandard(i))
              }).catch(err => error = err);
            break;
        }
      })
    }
  } else {
    error = utils.error("Bad t paramater", 400)
  }

  return new Promise((resolve, reject) => {
    if (results.length == 0) {
      if (error) {
        reject(error)
      } else {
        reject(utils.error("No content", 200))
      }
    } else {
      resolve(results)
    }
  })
}


function searchAlbumUPC(access_token, query, upc) {
  return new Promise(async (resolve, reject) => {

    var album = null;
    var error = null;
    var index = 0;
    var limit = call_limit; // improve the performances due to fullAlbums.filter
    var total = limit;
    
    var albums, fullAlbums;
    do {
      albums = fullAlbums = null;
      const path = '/v1/search?type=album&limit=' + limit + '&offset=' + index + '&q=' + encodeURI(query);

      try {
        albums = await genericHttps(access_token, path);
        if(albums && albums.albums && albums.albums.items) {
          total = albums.albums.total;
          try {
            fullAlbums = await Promise.all(albums.albums.items.map(i => fetchAlbum(access_token, i.id)));
            // fullAlbums = await Promise.all(albums.albums.items.filter(i => utils.checkSize(query, i.name)).map(i => fetchAlbum(access_token, i.id)));
          } finally {
            if (fullAlbums) {
              album = fullAlbums.filter(a => a.external_ids.upc == upc);
              album = album[0] ? formatAlbumToStandard(album[0]) : null;
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

    if (album) {
      resolve(album)
    } else if (error) {
      reject(error)
    } else {
      reject(utils.error("Not found", 200))
    }
  });
}

function searchTrackISRC(access_token, query, isrc) {
  return new Promise(async (resolve, reject) => {

    var track = null;
    var error = null;
    var index = 0;
    var limit = call_limit/2; // improve the performances due to fullAlbums.filter
    var total = limit;

    var tracks, fullTracks;
    do {
      tracks = fullTracks = null;
      const path = '/v1/search?type=track&limit=' + limit + '&offset=' + index + '&q=' + encodeURI(query);

      try {
        tracks = await genericHttps(access_token, path);
        if(tracks && tracks.tracks && tracks.tracks.items) {
          total = tracks.tracks.total;
          try {
            fullTracks = await Promise.all(tracks.tracks.items.filter(i => utils.checkSize(query, i.title)).map(i => fetchTrack(access_token, i.id)))
            //fullAlbums = await Promise.all(albums.data.map(i => fetchAlbum(i.id)))
          } finally {
            if (fullTracks) {
              track = fullTracks.filter(a => a.external_ids.isrc == isrc);
              track = track[0] ? formatTrackToStandard(track[0]) : null;
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

    if (track) {
      resolve(track)
    } else if (error) {
      reject(error)
    } else {
      reject(utils.error("Not found", 200))
    }
  });
}


/**
 * getMyReleases
 * @params user_id
 * @params access_token
 */
async function getMyReleases(access_token) {
  const user_id = 'me';
  var releases = [];
  var error;

  const artists = await fetchArtists(access_token, user_id).catch(err => error = err);

  if(artists && artists.length > 0) {
    await Promise
      .all(artists.map(i => 
        fetchArtist(access_token, i.id).catch(err => error = err))
      )
      .then(results => {
        results.forEach((a) => {
          if (a.albums && a.albums.length > 0) {
            releases.push(formatArtistToFeed(a));
          }
        })
      }).catch(err => error = err);
  }
  
  var genres = [];
  if(releases && releases.length > 0) {
    var availableGenres = [];
    releases.forEach(i => {
      Array.prototype.push.apply(availableGenres, i.content.genre.split(':'))
    })
    genres = [...new Set(availableGenres.sort())];
    genres.unshift("Tous");

    var key = 0;
    genres = genres.map(i => new Object({
      key: ++key,
      value: i,
    }))
  }
  releases.genres = genres;

  /*
  const playlists = await fetchPlaylists(user_id, access_token).catch(err => error = err);
  if(playlists && playlists.length > 0) {
    playlists.forEach(p => {
      if(!p.is_loved_track && p.creator.id != user_id) {
        releases.push(formatPlaylistToFeed(p));
      }
    });
  }*/

  return new Promise((resolve, reject) => {
    if (releases.length == 0) {
      if (error) {
        reject(error);
      } else {
        reject(utils.error("No content"), 200);
      }
    } else {
      //releases.sort((a,b) => sortLastReleases(a,b));
      resolve(releases)
    }
  });
}


/**
 * getReleaseContent
 * @params obj
 * @params id
 */
function getReleaseContent(access_token, obj, id) {
  return new Promise((resolve, reject) => {
    if(obj === 'album') {
      // retrieve the general content
      const promise = fetchAlbum(access_token, id)
        .then((response) => {
          resolve(formatAlbumToFeed(response));
          //return formatAlbumToFeed(response);
        }).catch(err => reject(err));

      // retrieve the related artists
      promise.then((release) => {
        getRelatedArtists(access_token, release.author.id).then((response) => {
          release.related = response;
          release.related.sort((a,b) => sortLastReleases(a,b));
          resolve(release);
        }).catch(err => reject(err));
      }).catch(err => reject(err));
    } /*else if (obj === 'playlist') {
      getPlaylistContent(id)
        .then((response) => {       
          resolve(formatPlaylistToFeed(response));          
        }).catch(err => reject(err));
    }*/ else {
      reject(utils.error('No content', 200))
    }
  });
}

/**
 * fetchArtists
 * @params user_id
 * @params access_token
 */
function fetchArtists(access_token, user_id) {
  return new Promise((resolve, reject) => {
    const path = '/v1/me/following?type=artist&';
    recursiveHttps(access_token, path)
      .then(result => {
        resolve(result)
      })
      .catch(error => reject(error));
  });
}

/**
 * fetchArtist
 * @params id
 */
function fetchArtist(access_token, id) {
  return new Promise((resolve, reject) => {
    const path = '/v1/artists/' + id;
    genericHttps(access_token, path)
      .then(result => {
        return result
      })
      .then(async (artist) => {
        await fetchArtistAlbums(access_token, id) // await for the response
          .then(artistAlbums => {
            artist.albums = artistAlbums.sort((a,b) => sortAlbums(a,b));
            resolve(artist);
          });
      })
      .catch(error => {
        reject(error)
      });
  });
}

/**
 * fetchArtistAlbums
 * @params artist_id
 * @params access_token
 */
function fetchArtistAlbums(access_token, artist_id) {
  return new Promise((resolve, reject) => {
    const path = '/v1/artists/' + artist_id + '/albums?';
    recursiveHttps(access_token, path)
      .then(artistAlbums => {
        resolve(artistAlbums);
      })
      .catch(error => {
        reject(error)
      });
  });
}


/**
 * fetchAlbum
 * @params id
 */
function fetchAlbum(access_token, id) {
  return new Promise((resolve, reject) => {
    const path = '/v1/albums/'+id;
    genericHttps(access_token, path)
      .then(result => {
        resolve(result);
      })
      .catch(error => reject(error));
  });
}

/**
 * fetchTrack
 * @params id
 */
function fetchTrack(access_token, id) {
  return new Promise((resolve, reject) => {
    const path = '/v1/tracks/'+id;
    genericHttps(access_token, path)
      .then(result => {
        resolve(result);
      })
      .catch(error => reject(error));
  });
}

/**
 * getGenres
 * @params id
 */
function getGenres(access_token) {
  return new Promise((resolve, reject) => {
    const path = '/v1/recommendations/available-genre-seeds';
    genericHttps(access_token, path)
      .then(result => {
        resolve(result);
      })
      .catch(error => reject(error));
  });
}

////////////////////////
// FORMAT TO STANDARD //
////////////////////////
function formatArtistToStandard(artist) {
  return {
    _obj: 'artist',
    _uid: 'spotify-'+artist.type+'-'+artist.id,
    // Related to the author
    id: artist.id,
    name: artist.name,
    picture: artist.images && artist.images.length > 0 ? artist.images[0].url : null,
    link: artist.external_urls.spotify ? artist.external_urls.spotify : "https://open.spotify.com/artist/"+artist.id,
    albums: /*artist.albums ? artist.albums.data.map(i => formatAlbumToStandard(i)) :*/ null,
    nb_albums: /*artist.nb_album ? artist.nb_album :*/ null,
    nb_fans: artist.followers ? artist.followers.total : null,
    added_at: /*artist.time_add ? timestampToDate(artist.time_add) :*/ null,
  };
}

function formatAlbumToStandard(album){
  return {
    _obj: 'album',
    _uid: 'spotify-'+album.album_type+'-'+album.id,
    // Related to the author
    id: album.id,
    name: album.name,
    type: album.album_type,
    picture: album.images && album.images.length > 0 ? album.images[0].url : null,
    link: album.external_urls.spotify ? album.external_urls.spotify : "https://open.spotify.com/album/"+album.id,
    upc: album.external_ids.upc || null,
    artists: album.artists.map(i => formatArtistToStandard(i)),
    updated_at: album.release_date,
    added_at: /*album.time_add ? timestampToDate(album.time_add) :*/ null,
  };
}

function formatPlaylistToStandard(playlist){
  return {
    _obj: 'playlist',
    _uid: 'spotify-'+playlist.type+'-'+playlist.id,
    // Related to the author
    id: playlist.id,
    name: playlist.name,
    description: playlist.description,
    picture: playlist.images && playlist.images.length > 0 ? playlist.images[0].url : null,
    link: playlist.external_urls.spotify ? playlist.external_urls.spotify : "https://open.spotify.com/playlist/"+playlist.id,
    updated_at: /*playlist.time_mod ? timestampToDate(playlist.time_mod) :*/ null,
    added_at: /*playlist.time_add ? timestampToDate(playlist.time_add) :*/ null,
  };
}

function formatTrackToStandard(track){
  return {
    _obj: 'track',
    _uid: 'spotify-'+track.type+'-'+track.id,
    // Related to the author
    id: track.id,
    name: track.name,
    link: track.external_urls ? track.external_urls.spotify : "https://open.spotify.com/track/"+track.id,
    isrc: track.external_ids ? track.external_ids.isrc : null,
    preview: track.preview_url,
    duration: track.duration_ms ? timestampToTime(track.duration_ms) : null,
    artist: track.artists.map(i => formatArtistToStandard(i))
  };
}

function formatUserToStandard(user){
  return {
    _obj: 'user',
    _uid: 'spotify-'+user.type+'-'+user.id,
    // Related to the author
    id: user.id,
    name: user.display_name,
    profile: user.external_urls.spotify,
    fullname: null,
    picture: user.images[0] ? user.images[0].url : null,
  };
}

//////////////////////////////
// FORMAT TO FEED (RELEASE) //
//////////////////////////////
function formatArtistToFeed(artist){
  const firstAlbum = artist.albums[0];
  const firstArtistAlbum = artist.albums[0].artists[0];

  return {
    _obj: 'album',
    _from: 'spotify',
    _uid: 'deezer-'+firstAlbum.album_type+'-'+artist.id+'-'+artist.albums[0].id,
    // Related to the author
    author: {
      id: firstArtistAlbum.id,
      name: firstArtistAlbum.name,
      picture: firstArtistAlbum.images && firstArtistAlbum.images.length > 0 ? firstArtistAlbum.images[0].url : null,
      link: firstArtistAlbum.external_urls.spotify ? firstArtistAlbum.external_urls.spotify : null,
      added_at: null,
    },
    // Related to the content
    content: {
      id: firstAlbum.id,
      title: firstAlbum.name,
      description: 'Based on your feed with ' + artist.name,
      type: firstAlbum.album_type,
      picture: firstAlbum.images[0] ? firstAlbum.images[0].url : null,
      link: firstAlbum.external_urls.spotify,
      upc: firstAlbum.upc || null,
      genre: artist.genres ? artist.genres.join(':') : '',
      updated_at: firstAlbum.release_date,
      last: artist.albums[0],
    }
  };
}

function formatAlbumToFeed(album) {
  const mainArtist = album.artists[0];
  return {
    _obj: 'album',
    _from: 'spotify',
    _uid: 'deezer-'+album.album_type+'-'+mainArtist.id+'-'+album.id,
    // Related to the author
    author: {
      id: mainArtist.id,
      name: mainArtist.name,
      picture: mainArtist.images && mainArtist.images.length > 0 ? mainArtist.images[0].url : null,
      link: mainArtist.external_urls.spotify,
      added_at: null,
    },
    // Related to the content
    content: {
      id: album.id,
      title: album.name,
      description: 'Based on an album you liked',
      type: album.album_type,
      picture: album.images && album.images.length > 0 ? album.images[0].url : null,
      link: album.url,
      upc: album.external_ids.upc || null,
      genre: album.genres.join(':') ? mainArtist.genres.join(':') : '',
      updated_at: album.release_date,
      tracks: album.tracks ? album.tracks.items.map(i => formatTrackToStandard(i)) : null,
      last: album,
    },
  };
}

///////////////
// UTILITIES //
///////////////
function sortLastReleases ( a, b ) {
  if ( a.content.updated_at == null ) return 1;
  if ( b.content.updated_at == null ) return -1;

  if ( a.content.updated_at > b.content.updated_at ) {
    return -1;
  }
  if ( a.content.updated_at < b.content.updated_at ) {
    return 1;
  }
  return 0;
}

function sortAlbums ( a, b ) {
  if ( a.release_date == null ) return 1;
  if ( b.release_date == null ) return -1;

  if ( a.release_date > b.release_date ) {
    return -1;
  }
  if ( a.release_date < b.release_date ) {
    return 1;
  }
  return 0;
}

function sortFriends ( a, b ) {
  if ( a.name == null ) return -1;
  if ( b.name == null ) return 1;

  if ( utils.capitalize(a.name) > utils.capitalize(b.name) ) {
    return 1;
  }
  if ( utils.capitalize(a.name) < utils.capitalize(b.name) ) {
    return -1;
  }
  return 0;
}

function timestampToDate(seconds) {
  return moment.unix(seconds/1000).format("YYYY-MM-DD");
}

function timestampToTime(seconds) {
  return moment.unix(seconds/1000).format("mm:ss");
}

exports.getMeAccount = getMeAccount;
exports.getSearch = getSearch;
exports.searchAlbumUPC = searchAlbumUPC;
exports.searchTrackISRC = searchTrackISRC;
exports.getMyReleases = getMyReleases;
exports.getReleaseContent = getReleaseContent;

