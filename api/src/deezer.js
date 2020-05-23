const https = require('https');
const sleep = require('await-sleep');
const moment = require('moment');
const utils = require('../../utils');

const call_limit = 100; // Limit of items to retrieve
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
        if (response.statusCode === 200) {
          try {
            let json = JSON.parse(responseBody)

            if (!json) { // json is undefined or null
              reject(utils.error("Unvalid json", 500));
            } else if (json.error) { // json has an error (set by Deezer)
              reject(utils.error(json.error.message, json.error.code));
            } else { // otherwise, json is ok
              resolve(json)
            }
          } catch(e) {
            reject(utils.error(e.message, 500));
          }
        } else {
          reject(utils.error(response, response.statusCode));
        }
      })
    }).on('error', function(e) {
      reject(utils.error(e.message, 500));
    });
  })
}

/**
 * fetchArtists
 * @params user_id
 * @params access_token
 */
async function fetchArtists(user_id, access_token) {

  var artists = [];
    
  return new Promise((resolve, reject) => {
    /**
     * recursive Fill the artists array and handle the pagination recursively
     * @params index
     * @params retry
     */
    let recursive = async function (index = 0, retry = retry_limit) {
      // Configuration of the https request
      const options = {
        hostname: 'api.deezer.com',
        path: '/user/'+user_id+'/artists?limit='+call_limit+'&index='+index+(access_token ? '&access_token='+access_token : ''),
        method: 'GET',
        headers: {
          'content-type': 'text/json'
        },
      };

      httpsCall(options)
        .then(response => { // response is ok, push the result in array
          Array.prototype.push.apply(artists, response.data)
          if(response.next) { // if has a next object, keep going
            recursive(index+call_limit)
              .catch(() => resolve(artists)); // resolve the iterations if an error happens
          } else { // no more page, resolve with the result
            resolve(artists);
          }
        })
        .catch(err => {
          if (retry > 0 && err.code == 4) { // too many request and still have a retry, so wait for a delay and get back
            setTimeout(recursive, retry_timeout, index, retry-1);
          } else {
            if(artists.length == 0) { // if there's no playlist retrieved, reject with the error
              reject(err);              
            } else { // otherwise, best-effort mode
              resolve(artists);
            }
          }
        });
    };

    recursive()
  });
}

/**
 * getArtists
 * @params user_id
 * @params access_token
 */
async function getArtists(user_id = 'me', access_token) {
  return new Promise((resolve, reject) => {
    fetchArtists(user_id, access_token)
      .then(result => {
        resolve(result.map(a => formatArtistToStandard(a)))
      })
      .catch(err => reject(err));
  });
}

/**
 * fetchArtist
 * @params id
 */
async function fetchArtist(id) {

  var artist;
  var callError;
  var retry = retry_limit;

  // get the general data of the artist
  do {
    const options = {
        hostname: 'api.deezer.com',
        path: '/artist/'+id,
        method: 'GET',
        headers: {
          'content-type': 'text/json'
        },
      };

    const call = await httpsCall(options) // await for the response
      .catch(err => { // catch if error
        callError = err;
        retry--;
      });

    if(call) {
      artist = call; // push the data in the response
    } else {
      await sleep(retry_timeout);
    }
  } while (!artist && retry > 0); // loop while there is another page
  
  // get the albums of the artist
  if (artist) {
    const call = await fetchArtistAlbums(id) // await for the response
      .then(response => {
        return response.sort((a,b) => sortAlbums(a,b));
      })
      .then(albums => {
        artist.albums = albums;
      })
      .catch(err => { // catch if error
        callError = err;
      });
  }
  
  return new Promise((resolve, reject) => {
    if (artist) {
      resolve(artist);
    } else {
      reject(callError);
    }
  })
}

/**
 * fetchArtistAlbums
 * @params artist_id
 * @params access_token
 */
async function fetchArtistAlbums(artist_id, access_token) {

  var albums = [];

  return new Promise((resolve, reject) => {
    /**
     * recursive Fill the artists array and handle the pagination recursively
     * @params index
     * @params retry
     */
    let recursive = async function (index = 0, retry = retry_limit) {
      // Configuration of the https request
      const options = {
        hostname: 'api.deezer.com',
        path: '/artist/'+artist_id+'/albums?limit='+call_limit+'&index='+index+(access_token ? '&access_token='+access_token : ''),
        method: 'GET',
        headers: {
          'content-type': 'text/json'
        },
      };

      httpsCall(options)
        .then(response => { // response is ok, push the result in array
          Array.prototype.push.apply(albums, response.data)
          if(response.next) { // if has a next object, keep going
            recursive(index+call_limit)
              .catch(() => resolve(albums)); // resolve the iterations if an error happens
          } else { // no more page, resolve with the result
            resolve(albums);
          }
        })
        .catch(err => {
          if (retry > 0 && err.code == 4) { // too many request and still have a retry, so wait for a delay and get back
            setTimeout(recursive, retry_timeout, index, retry-1);
          } else {
            if(albums.length == 0) { // if there's no playlist retrieved, reject with the error
              reject(err);
            } else { // otherwise, best-effort mode
              // resolve(albums); // commented as it will block the others calls
            }
          }
        });
    };

    recursive()
  });
}

/**
 * getArtist
 * @params id
 */
async function getArtist(id) {
  return new Promise((resolve, reject) => {
    fetchArtist(id)
      .then(result => {
        resolve(formatArtistToStandard(result))
      })
      .catch(err => reject(err));
  });
}


/**
 * getRelatedArtists
 * @params id
 */
async function getRelatedArtists(id) {

  var artists = [];
  var callError;
  var retry = retry_limit;

  // get the general data of the artist
  do {
    const options = {
        hostname: 'api.deezer.com',
        path: '/artist/'+id+'/related',
        method: 'GET',
        headers: {
          'content-type': 'text/json'
        },
      };

    const call = await httpsCall(options) // await for the response
      .catch(err => { // catch if error
        callError = err;
        retry--;
      });

    if(call) {
      await Promise
        .all(call.data.map(a => fetchArtist(a.id)))
        .then(results => {
          results.forEach((a) => {
            if (a.albums && a.albums.length > 0) {            
              artists.push(formatArtistToFeed(a));
            }
          })
        }).catch(err => callError = err);
    } else {
      await sleep(retry_timeout);
    }
  } while (!artists && retry > 0); // loop while there is another page
  
  return new Promise((resolve, reject) => {
    if (artists) {
      resolve(artists);
    } else {
      reject(callError);
    }
  })
}

/**
 * fetchAlbums
 * @params user_id
 * @params access_token
 */
async function fetchAlbums(user_id = 'me', access_token) {

  var albums = [];
    
  return new Promise((resolve, reject) => {
    /**
     * recursive Fill the artists array and handle the pagination recursively
     * @params index
     * @params retry
     */
    let recursive = async function (index = 0, retry = retry_limit) {
      // Configuration of the https request
      const options = {
        hostname: 'api.deezer.com',
        path: '/user/'+user_id+'/albums?limit='+call_limit+'&index='+index+(access_token ? '&access_token='+access_token : ''),
        method: 'GET',
        headers: {
          'content-type': 'text/json'
        },
      };

      httpsCall(options)
        .then(response => { // response is ok, push the result in array
          Array.prototype.push.apply(albums, response.data)
          if(response.next) { // if has a next object, keep going
            recursive(index+call_limit)
              .catch(() => resolve(albums)); // resolve the iterations if an error happens
          } else { // no more page, resolve with the result
            resolve(artists);
          }
        })
        .catch(err => {
          if (retry > 0 && err.code == 4) { // too many request and still have a retry, so wait for a delay and get back
            setTimeout(recursive, retry_timeout, index, retry-1);
          } else {
            if(albums.length == 0) { // if there's no playlist retrieved, reject with the error
              reject(err);              
            } else { // otherwise, best-effort mode
              resolve(albums);
            }
          }
        });
    };

    recursive()
  });
}

/**
 * fetchAlbums
 * @params user_id
 * @params access_token
 */
async function fetchAlbums(user_id = 'me', access_token) {
  return new Promise((resolve, reject) => {
    fetchAlbums(user_id, access_token)
      .then(result => {
        resolve(result.map(a => formatAlbumToFeed(a)))
      })
      .catch(err => reject(err));
  });
}

/**
 * fetchAlbum
 * @params id
 */
async function fetchAlbum(id) {

  var album;
  var callError;
  var retry = retry_limit;

  // get the general data of the artist
  do {
    const options = {
        hostname: 'api.deezer.com',
        path: '/album/'+id,
        method: 'GET',
        headers: {
          'content-type': 'text/json'
        },
      };

    const call = await httpsCall(options) // await for the response
      .catch(err => { // catch if error
        callError = err;
        retry--;
      });

    if(call) {
      album = call; // push the data in the response
    } else {
      await sleep(retry_timeout);
    }
  } while (!album && retry > 0); // loop while there is another page
  
  return new Promise((resolve, reject) => {
    if (album) {
      resolve(album);
    } else {
      reject(callError);
    }
  })
}

/**
 * fetchPlaylists
 * @params user_id
 * @params access_token
 */
async function fetchPlaylists(user_id = 'me', access_token) {

  var playlists = [];
  
  return new Promise((resolve, reject) => {
    /**
     * recursive Fill the playlists array and handle the pagination recursively
     * @params index
     * @params retry
     */
    let recursive = async function (index = 0, retry = retry_limit) {
      // Configuration of the https request
      const options = {
        hostname: 'api.deezer.com',
        path: '/user/'+user_id+'/playlists?limit='+call_limit+'&index='+index+(access_token ? '&access_token='+access_token : ''),
        method: 'GET',
        headers: {
          'content-type': 'text/json'
        },
      };

      httpsCall(options)
        .then(response => { // response is ok, push the result in array
          Array.prototype.push.apply(playlists, response.data)
          if(response.next) {
            recursive(index+call_limit)
              .catch(() => resolve(playlists)); // resolve the iterations if an error happens
          } else { // no more page, resolve with the result
            resolve(playlists);
          }
        })
        .catch(err => {
          if (retry > 0 && err.code == 4) { // too many request and still have a retry, so wait for a delay and get back
            setTimeout(recursive, retry_timeout, index, retry-1);
          } else {
            resolve(playlists);
          }
        });
    };

    recursive()
  });
}

/**
 * getPlaylistContent Return the artist content with its albums
 * @params id
 */
async function getPlaylistContent(id) {

  var content;
  var callError;
  var retry = retry_limit;

  // get the general data of the artist
  do {
    const options = {
        hostname: 'api.deezer.com',
        path: '/playlist/'+id,
        method: 'GET',
        headers: {
          'content-type': 'text/json'
        },
      };

    const call = await httpsCall(options) // await for the response
      .catch(err => { // catch if error
        callError = err;
        retry--;
      });

    if(call) {
      content = call; // push the data in the response
    } else {
      await sleep(retry_timeout);
    }
  } while (!content && retry > 0); // loop while there is another page
  
  return new Promise((resolve, reject) => {
    if (content) {
      resolve(content);
    } else {
      reject(callError);
    }
  })
}

/**
 * getPlaylists
 * @params user_id
 * @params access_token
 */
async function getPlaylists(user_id = 'me', access_token) {
  return new Promise((resolve, reject) => {
    fetchPlaylists(user_id, access_token)
      .then(result => {
        resolve(result.map(p => formatPlaylistToStandard(p)))
      })
      .catch(err => reject(err));
  });
}


/**
 * fetchTrack
 * @params id
 */
async function fetchTrack(id) {

  var track;
  var callError;
  var retry = retry_limit;

  // get the general data of the artist
  do {
    const options = {
        hostname: 'api.deezer.com',
        path: '/track/'+id,
        method: 'GET',
        headers: {
          'content-type': 'text/json'
        },
      };

    const call = await httpsCall(options) // await for the response
      .catch(err => { // catch if error
        callError = err;
        retry--;
      });

    if(call) {
      track = call; // push the data in the response
    } else {
      await sleep(retry_timeout);
    }
  } while (!track && retry > 0); // loop while there is another page
  
  return new Promise((resolve, reject) => {
    if (track) {
      resolve(track);
    } else {
      reject(callError);
    }
  })
}

/**
 * getMyReleases
 * @params user_id
 * @params access_token
 */
async function getMyReleases(access_token) {
  const user_id = 'me';
  var releases = [];
  var callError;

  const artists = await fetchArtists(user_id, access_token).catch(err => callError = err);
  if(artists && artists.length > 0) {
    await Promise
      .all(artists.map(a => 
        fetchArtist(a.id).catch(err => callError = err))
      )
      .then(results => {
        results.forEach((a) => {
          if (a.albums && a.albums.length > 0) {
            releases.push(formatArtistToFeed(a));
          }
        })
      }).catch(err => callError = err);
  }
  var genres = [];
  genres.push({key: -42, value: "Tous"})
  if(artists && artists.length > 0) {
    var availableGenres = [...new Set(releases.map(item => item.content.genre))];
    const call = await getGenres().catch(err => callError = err);
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

  const playlists = await fetchPlaylists(user_id, access_token).catch(err => callError = err);
  if(playlists && playlists.length > 0) {
    playlists.forEach(p => {
      if(!p.is_loved_track && p.creator.id != user_id) {
        releases.push(formatPlaylistToFeed(p));
      }
    });
  }

  return new Promise((resolve, reject) => {
    if (releases.length == 0) {
      if (callError) {
        reject(callError);
      } else {
        reject(utils.error("No content"), 200);
      }
    } else {
      releases.sort((a,b) => sortLastReleases(a,b));
      resolve(releases)
    }
  });
}


/**
 * getReleases
 * @params user_id
 * @params access_token
 */
async function getReleases(user_id, access_token) {
  var releases = [];
  var callError;

  const artists = await fetchArtists(user_id, access_token).catch(err => callError = err);
  if(artists && artists.length > 0) {
    await Promise
      .all(artists.map(a => 
        fetchArtist(a.id).catch(err => callError = err))
      )
      .then(results => {
        results.forEach((a) => {
          if (a.albums && a.albums.length > 0) {            
            releases.push(formatArtistToFeed(a));
          }
        })
      }).catch(err => callError = err);
  }

  var genres = [];
  genres.push({key: -42, value: "Tous"})
  if(artists && artists.length > 0) {
    var availableGenres = [...new Set(releases.map(item => item.content.genre))];
    const call = await getGenres().catch(err => callError = err);
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

  const playlists = await fetchPlaylists(user_id, access_token).catch(err => callError = err);
  if(playlists && playlists.length > 0) {
    playlists.forEach(p => {
      releases.push(formatPlaylistToFeed(p));
    });
  }

  const albums = await fetchAlbums(user_id, access_token).catch(err => callError = err);
  if(albums && albums.length > 0) {
    albums.forEach(a => {
      let existingAlbum = releases.find(r => {
        return r.content.id == a.id && r.content.type == a.record_type;
      });

      if (! existingAlbum) {
        releases.push(formatAbumToFeed(a));
      }
    });
  }

  return new Promise((resolve, reject) => {
    if (releases.length == 0) {
      if (callError) {
        reject(callError);
      } else {
        reject(utils.error("No content"), 200);
      }
    } else {
      releases.sort((a,b) => sortLastReleases(a,b));
      resolve(releases)
    }
  });
}

/**
 * getReleaseContent
 * @params obj
 * @params id
 */
async function getReleaseContent(obj, id) {
  return new Promise((resolve, reject) => {
    if(obj === 'album') {
      // retrieve the general content
      const promise = fetchAlbum(id)
        .then((response) => {
          return formatAlbumToFeed(response);
        }).catch(err => reject(err));

      // retrieve the related artists
      promise.then((release) => {
        getRelatedArtists(release.author.id).then((response) => {
          release.related = response;
          release.related.sort((a,b) => sortLastReleases(a,b));
          resolve(release);
        })
      }).catch(err => reject(err));
    } else if (obj === 'playlist') {
      getPlaylistContent(id)
        .then((response) => {       
          resolve(formatPlaylistToFeed(response));          
        }).catch(err => reject(err));
    } else {
      reject(utils.error('No content', 200))
    }
  });
}

/**
 * getRelatedArtists
 * @params id
 */
async function getGenres() {

  var genres = [];
  var callError;
  var retry = retry_limit;

  // get the general data of the artist
  do {
    const options = {
        hostname: 'api.deezer.com',
        path: '/genre',
        method: 'GET',
        headers: {
          'content-type': 'text/json'
        },
      };

    const call = await httpsCall(options) // await for the response
      .catch(err => { // catch if error
        callError = err;
        retry--;
      });

    if(call) {
      genres = call.data;
    } else {
      await sleep(retry_timeout);
    }
  } while (genres.length == 0 && retry > 0); // loop while there is another page
  
  return new Promise((resolve, reject) => {
    if (genres.length == 0) {
      if (callError) {
        reject(callError);
      } else {
        reject(utils.error("No content"), 200);
      }
    } else {
      resolve(genres)
    }
  })
}

/**
 * fetchFollowings
 * @params user_id
 * @params access_token
 */
async function fetchFollowings(user_id, access_token) {

  var followings = [];
    
  return new Promise((resolve, reject) => {
    /**
     * recursive Fill the artists array and handle the pagination recursively
     * @params index
     * @params retry
     */
    let recursive = async function (index = 0, retry = retry_limit) {
      // Configuration of the https request
      const options = {
        hostname: 'api.deezer.com',
        path: '/user/'+user_id+'/followings?limit='+call_limit+'&index='+index+(access_token ? '&access_token='+access_token : ''),
        method: 'GET',
        headers: {
          'content-type': 'text/json'
        },
      };

      httpsCall(options)
        .then(response => { // response is ok, push the result in array
          Array.prototype.push.apply(followings, response.data)
          if(response.next) { // if has a next object, keep going
            recursive(index+call_limit)
              .catch(() => resolve(followings)); // resolve the iterations if an error happens
          } else { // no more page, resolve with the result
            resolve(followings);
          }
        })
        .catch(err => {
          if (retry > 0 && err.code == 4) { // too many request and still have a retry, so wait for a delay and get back
            setTimeout(recursive, retry_timeout, index, retry-1);
          } else {
            if(followings.length == 0) { // if there's no playlist retrieved, reject with the error
              reject(err);              
            } else { // otherwise, best-effort mode
              resolve(followings);
            }
          }
        });
    };

    recursive()
  });
}

/**
 * fetchFollowings
 * @params user_id
 * @params access_token
 */
async function fetchFollowings(user_id, access_token) {

  var followings = [];
    
  return new Promise((resolve, reject) => {
    /**
     * recursive Fill the artists array and handle the pagination recursively
     * @params index
     * @params retry
     */
    let recursive = async function (index = 0, retry = retry_limit) {
      // Configuration of the https request
      const options = {
        hostname: 'api.deezer.com',
        path: '/user/'+user_id+'/followings?limit='+call_limit+'&index='+index+(access_token ? '&access_token='+access_token : ''),
        method: 'GET',
        headers: {
          'content-type': 'text/json'
        },
      };

      httpsCall(options)
        .then(response => { // response is ok, push the result in array
          Array.prototype.push.apply(followings, response.data)
          if(response.next) { // if has a next object, keep going
            recursive(index+call_limit)
              .catch(() => resolve(followings)); // resolve the iterations if an error happens
          } else { // no more page, resolve with the result
            resolve(followings);
          }
        })
        .catch(err => {
          if (retry > 0 && err.code == 4) { // too many request and still have a retry, so wait for a delay and get back
            setTimeout(recursive, retry_timeout, index, retry-1);
          } else {
            if(followings.length == 0) { // if there's no playlist retrieved, reject with the error
              reject(err);              
            } else { // otherwise, best-effort mode
              resolve(followings);
            }
          }
        });
    };

    recursive()
  });
}


/**
 * fetchFollowings
 * @params user_id
 * @params access_token
 */
async function fetchFollowers(user_id, access_token) {

  var followers = [];
    
  return new Promise((resolve, reject) => {
    /**
     * recursive Fill the artists array and handle the pagination recursively
     * @params index
     * @params retry
     */
    let recursive = async function (index = 0, retry = retry_limit) {
      // Configuration of the https request
      const options = {
        hostname: 'api.deezer.com',
        path: '/user/'+user_id+'/followers?limit='+call_limit+'&index='+index+(access_token ? '&access_token='+access_token : ''),
        method: 'GET',
        headers: {
          'content-type': 'text/json'
        },
      };

      httpsCall(options)
        .then(response => { // response is ok, push the result in array
          Array.prototype.push.apply(followers, response.data)
          if(response.next) { // if has a next object, keep going
            recursive(index+call_limit)
              .catch(() => resolve(followers)); // resolve the iterations if an error happens
          } else { // no more page, resolve with the result
            resolve(followers);
          }
        })
        .catch(err => {
          if (retry > 0 && err.code == 4) { // too many request and still have a retry, so wait for a delay and get back
            setTimeout(recursive, retry_timeout, index, retry-1);
          } else {
            if(followers.length == 0) { // if there's no playlist retrieved, reject with the error
              reject(err);              
            } else { // otherwise, best-effort mode
              resolve(followers);
            }
          }
        });
    };

    recursive()
  });
}

async function getMeAccount(access_token) {
  var me;
  var callError;
  var retry = retry_limit;

  // get the general data of the artist
  do {
    const options = {
        hostname: 'api.deezer.com',
        path: '/user/me?access_token=' + access_token,
        method: 'GET',
        headers: {
          'content-type': 'text/json'
        },
      };

    const call = await httpsCall(options) // await for the response
      .catch(err => { // catch if error
        callError = err;
        retry--;
      });

    if(call) {
      me = call;
    } else {
      await sleep(retry_timeout);
    }
  } while (!me && retry > 0); // loop while there is another page
  
  return new Promise((resolve, reject) => {
    if (!me) {
      reject(utils.error("No content"), 200);
    } else {
      resolve(formatUserToStandard(me))
    }
  })
}

/**
 * getSocialFriends
 * @params id
 */
async function getSocialFriends(user_id, access_token) {
  return new Promise((resolve, reject) => {
      // retrieve the general content
      const promise = fetchFollowers(user_id, access_token)
        .then((response) => {
          let social = new Object();
          social.followers = response.map(a => formatUserToStandard(a)).sort((a,b) => sortFriends(a,b));
          return social;
        }).catch(err => reject(err));

      promise.then((social) => {
        fetchFollowings(user_id, access_token).then((response) => {
          social.followings = response.map(a => formatUserToStandard(a)).sort((a,b) => sortFriends(a,b));
          resolve(social);
        })
      }).catch(err => reject(err));

    });
}

async function fetchSearch(type, query, strict) {
  var search;
  var callError;
  var retry = retry_limit;

  // get the general data of the artist
  do {
    const options = {
        hostname: 'api.deezer.com',
        // artist?q=eminem
        path: '/search/'+type+'?q='+encodeURI(query)+(strict == true ? '&sort=ranking&strict=on':''),
        method: 'GET',
        headers: {
          'content-type': 'text/json'
        },
      };

    const call = await httpsCall(options) // await for the response
      .catch(err => { // catch if error
        callError = err;
        retry--;
      });

    if(call) {
      search = call;
    } else {
      await sleep(retry_timeout);
    }
  } while (!search && retry > 0); // loop while there is another page
  
  return new Promise((resolve, reject) => {
    if (!search) {
      if (callError) {
        reject(callError);
      } else {
        reject(utils.error("No content", 200));
      }
    } else {
      resolve(search)
    }
  })
}

async function getSearch(query, types = "*", strict = true) {
  const allowedTypes = ['artist', 'album', 'playlist', 'track', 'user'];
  var search_types = [];
  var results = new Object, countResults = 0;
  var callError;

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
        .then((result) => {
          switch(type) {
            case 'artist':
              results.artist = result.data.map(i => formatArtistToStandard(i));
              //results.artist = result.data;
              break;
            case 'album':
              results.album = result.data.map(i => formatAlbumToStandard(i));
              //results.album = result.data;
              break;
            case 'playlist':
              //results.playlist = result.data.map(i => formatTrackToStandard(i));
              results.playlist = result.data.map(i => formatPlaylistToStandard(i));
              break;
            case 'track':
              results.track = result.data.map(i => formatTrackToStandard(i));
              break;
            case 'user':
              results.user = result.data.map(i => formatUserToStandard(i));
              break;
          }
          countResults += result.data.length || 0;
        })
    })
    results.total = countResults;

    if (strict) {
      results.total = 0;
      await utils.asyncForEach(search_types, async (type) => {
        switch(type) {
          case 'artist':
            if (results.artist) {
              results.artist = results.artist.filter(item => item.name.toUpperCase() == query.toUpperCase())
              results.total += results.artist.length;
            }
            break;
          case 'album':
            if (results.album) {
              await Promise
                .all(results.album.map(a => fetchAlbum(a.id).catch(err => callError = err)))
                .then(albums => {
                  results.album = albums.map(i => formatAlbumToStandard(i))
                  results.total += results.album.length;
                }).catch(err => callError = err);
            }
            break;
          case 'track':
            if (results.track) {
              await Promise
                .all(results.track.map(t => fetchTrack(t.id).catch(err => callError = err)))
                .then(tracks => {
                  results.track = tracks.map(i => formatTrackToStandard(i))
                  results.total += results.tracks.length;
                }).catch(err => callError = err);
            }
            break;
          case 'user':
            if (results.user) {
              results.user = results.user.filter(item => item.name.toUpperCase() == query.toUpperCase())
              results.total += results.user.length;
            }
            break;
        }
      })
    }
  } else {
    callError = utils.error("Bad t paramater", 400)
  }

  return new Promise((resolve, reject) => {
    if (countResults == 0) {
      if (callError) {
        reject(callError)
      } else {
        reject(utils.error("No content", 200))
      }
    } else {
      resolve(results)
    }
  })
}

////////////////////////
// FORMAT TO STANDARD //
////////////////////////
function formatArtistToStandard(artist) {
  return {
    _obj: 'artist',
    _uid: 'deezer-'+artist.type+'-'+artist.id,
    // Related to the author
    id: artist.id,
    name: artist.name,
    picture: artist.picture ? artist.picture : null,
    link: artist.link ? artist.link : "httpss://www.deezer.com/artist/"+artist.id,
    albums: artist.albums ? artist.albums.data.map(a => formatAlbumToStandard(a)) : null,
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
      var contributors = album.contributors ? album.contributors.map(a => formatArtistToStandard(a)) : [];
      artists = [... contributors];
    }
  }

  return {
    _obj: 'album',
    _uid: 'deezer-'+album.record_type+'-'+album.id,
    // Related to the author
    id: album.id,
    name: album.title,
    picture: album.cover,
    link: album.link,
    upc: album.upc || null,
    artists: artists,
    updated_at: album.release_date,
    added_at: album.time_add ? timestampToDate(album.time_add) : null,
  };
}

function formatPlaylistToStandard(playlist){
  return {
    _obj: 'playlist',
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

function formatTrackToStandard(track){
  return {
    _obj: 'track',
    _uid: 'deezer-'+track.type+'-'+track.id,
    // Related to the author
    id: track.id,
    name: track.title,
    link: track.link,
    isrc: track.isrc || null,
    preview: track.preview,
    duration: track.duration ? timestampToTime(track.duration) : null,
    artist: formatArtistToStandard(track.artist)
  };
}

function formatUserToStandard(user){
  return {
    _obj: 'user',
    _uid: 'deezer-'+user.type+'-'+user.id,
    // Related to the author
    id: user.id,
    name: user.name,
    fullname: user.firstname && user.lastname ? user.firstname + ' ' + user.lastname : null,
    picture: user.picture,
  };
}

//////////////////////////////
// FORMAT TO FEED (RELEASE) //
//////////////////////////////
function formatArtistToFeed(artist){
  return {
    _obj: 'album',
    _uid: 'deezer-'+artist.albums[0].record_type+'-'+artist.id+'-'+artist.albums[0].id,
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
      id: artist.albums[0].id,
      title: artist.albums[0].title,
      type: artist.albums[0].record_type,
      picture: artist.albums[0].cover_medium,
      link: artist.albums[0].link,
      genre: artist.albums[0].genre_id,
      updated_at: artist.albums[0].release_date,
      last: artist.albums[0],
    }
  };
}

function formatAlbumToFeed(album) {
  return {
    _obj: 'album',
    _uid: 'deezer-'+album.record_type+'-'+album.artist.id+'-'+album.id,
    // Related to the author
    author: {
      id: album.artist.id,
      name: album.artist.name,
      picture: album.artist.picture_small,
      link: "httpss://www.deezer.com/profile/" + album.artist.id,
      added_at: album.time_add ? timestampToDate(album.time_add) : null,
    },
    // Related to the content
    content: {
      id: album.id,
      title: album.title,
      type: album.record_type,
      picture: album.cover_medium,
      link: album.link,
      genre: album.genre_id,
      updated_at: album.release_date,
      tracks: album.tracks ? album.tracks.data.map(t => formatTrackToStandard(t)) : null,
      last: album,
    },
  };
}

function formatPlaylistToFeed(playlist) {
  return {
    _obj: 'playlist',
    _uid: 'deezer-'+playlist.type+'-'+playlist.creator.id+'-'+playlist.id,
    // Related to the author
    author: {
      id: playlist.creator.id,
      name: playlist.creator.name,
      picture: null,
      link: "httpss://www.deezer.com/profile/" + playlist.creator.id,
      added_at: playlist.time_add ? timestampToDate(playlist.time_add) : null, 
    },
    // Related to the content
    content: {
      id: playlist.id,
      title: playlist.title,
      type: playlist.type,
      picture: playlist.picture_medium,
      link: playlist.link,
      genre: null,
      updated_at: playlist.time_mod ? timestampToDate(playlist.time_mod) : timestampToDate(playlist.time_add), 
      tracks: playlist.tracks ? playlist.tracks.data.map(t => formatTrackToStandard(t)) : null,
      last: playlist,
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
  return moment.unix(seconds).format("YYYY-MM-DD");
}

function timestampToTime(seconds) {
  return moment.unix(seconds).format("mm:ss");
}

exports.getArtists = getArtists;
exports.getRelatedArtists = getRelatedArtists;
exports.getArtist = getArtist;
exports.fetchAlbums = fetchAlbums;
exports.getPlaylists = getPlaylists;
exports.getMyReleases = getMyReleases;
exports.getReleases = getReleases;
exports.getReleaseContent = getReleaseContent;
exports.getGenres = getGenres;
exports.getMeAccount = getMeAccount;
exports.getSocialFriends = getSocialFriends;
exports.getSearch = getSearch;
