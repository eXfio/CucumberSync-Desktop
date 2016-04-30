OC.Contacts = OC.Contacts || {};
CSync = CSync || {};

(function(window, $, OC, CSync) {
	'use strict';

	var JSONResponse = function(jqXHR) {
		this.getAllResponseHeaders = jqXHR.getAllResponseHeaders;
		this.getResponseHeader = jqXHR.getResponseHeader;
		this.statusCode = jqXHR.status;
		var response = jqXHR.responseJSON;
		this.error = false;
		console.log('jqXHR', jqXHR);
		if (!response) {
			// 204 == No content
			// 304 == Not modified
			if ([204, 304].indexOf(this.statusCode) === -1) {
				this.error = true;
			}
			this.message = jqXHR.statusText;
		} else {
			// We need to allow for both the 'old' success/error status property
			// with the body in the data property, and the newer where we rely
			// on the status code, and the entire body is used.
			if (response.status === 'error'|| this.statusCode >= 400) {
				this.error = true;
				if (!response.data || !response.data.message) {
					this.message = t('contacts', 'Server error! Please inform system administator');
				} else {
					console.log('JSONResponse', response);
					this.message = (response.data && response.data.message)
						? response.data.message
						: response;
				}
			} else {
				this.data = response.data || response;
				// Kind of a hack
				if (response.metadata) {
					this.metadata = response.metadata;
				}
			}
		}
	};

	/**
	* An object for saving contact data to backends
	*
	* All methods returns a jQuery.Deferred object which resolves
	* to either the requested response or an error object:
	* {
	*	error: true,
	*	message: The error message
	* }
	*
	* @param string user The user to query for. Defaults to current user
	*/
	var Storage = function(user, account) {
		this.user = user ? user : OC.currentUser;
        this.account = account ? account : CSync.account;
        this.weaveClient = null;
        this.keyPair =null;

        weave.util.Log.setLevel("debug");
    };

    Storage.prototype.isAuthenticated = function() {
        weave.util.Log.debug("Storage.isAuthenticated()");
        return (this.account && this.account !== null && this.account.isInitialized());
    }
    
	Storage.prototype.initWeaveClient = function() {
        weave.util.Log.debug("Storage.initWeaveClient()");

        if (!this.isAuthenticated()) {
            return $.Deferred().reject("Account not authenticated");
        }
        
        var self = this;
        
        var defer = $.Deferred();
        
        if ( this.weaveClient !== null ) {
            return defer.resolve(true);
        } else {

            //init WeaveClient instance
            try {
                this.weaveClient = weave.client.WeaveClientFactory.getInstance(this.account.getWeaveAccount());
            } catch(e) {
                weave.util.Log.error("Couldn't initialise weave client - " + e.message);
                return defer.reject({error: true, message: e.message});
            }
                    
            //generate ephemeral keyPair to encrypt localStorage            
            var ikm  = forge.util.createBuffer(forge.random.getBytesSync(32));
            var info = forge.util.createBuffer("accounts.cucumberysync.com");
            var salt = forge.util.createBuffer();
            
            weave.crypto.HKDF.derive(ikm, info, salt, 2*32)
                .then(
                    function(derived) {
                        self.keyPair = {
	                        cryptKey: forge.util.createBuffer(derived.getBytes(32)),
	                        hmacKey:  forge.util.createBuffer(derived.getBytes())
                        };
	                    
	                    weave.util.Log.info("Successfully generated key pair");
	                    weave.util.Log.debug("ikm: " + ikm.toHex() + ", crypt key: " + self.keyPair.cryptKey.toHex() + ", hmac key: " + self.keyPair.hmacKey.toHex());
                        
                        defer.resolve(true);
                    },
                    function(error) {
                        var message = (error instanceof Object && error.message ? error.message : error);
                        console.error("Couldn't generate key pair - " + message);
                        defer.reject({error: true, message: message});
                    }
                );            
	    }

        return defer.promise();
    }
    
	/**
	 * Test if localStorage is working
	 *
	 * @return bool
	 */
	Storage.prototype.hasLocalStorage = function() {
		return true;
	};

	/**
	 * When the response isn't returned from requestRoute(), you can
	 * wrap it in a JSONResponse so that it's parsable by other objects.
	 *
	 * @param XMLHTTPRequest http://api.jquery.com/jQuery.ajax/#jqXHR
	 */
	Storage.prototype.formatResponse = function(jqXHR) {
		return new JSONResponse(jqXHR);
	};

	/**
	 * Get all address books registered for this user.
	 *
	 * @return An array containing object of address book metadata e.g.:
	 * {
	 *    backend:'local',
	 *    id:'1234'
	 *    permissions:31,
	 *    displayname:'Contacts'
	 * }
	 */
	Storage.prototype.getAddressBooksForUser = function() {
		//FIXME - Implement in Weave backend
		//set to default values
		var response = {
			statusCode: 200,
			error: false,
			metadata: {},
			data: {
				addressbooks: [
					{
						backend: 'local',
						id: 1,
						permissions: 31,
						displayname: 'Contacts',
                        active: true
					}
				]
			}
		};

		//var defer = $.Deferred();
		//defer.resolve(response);
		//return defer.promise();
        return $.when(response);
        
		/*
		return this.requestRoute(
			'addressbooks/',
			'GET',
			{}
		);
        */
	};

	/**
	 * Add an address book to a specific backend
	 *
	 * @param string backend - currently defaults to 'local'
	 * @param object params An object {displayname:"My contacts", description:""}
	 * @return An array containing contact data e.g.:
	 * {
	 * metadata:
	 * {
	 *     id:'1234'
	 *     permissions:31,
	 *     displayname:'My contacts',
	 *     lastmodified: (unix timestamp),
	 *     owner: 'joye',
	 * }
	 */
	Storage.prototype.addAddressBook = function(backend, parameters) {
		console.log('Storage.addAddressBook', backend);
		return this.requestRoute(
			'addressbook/{backend}/add',
			'POST',
			{backend: backend},
			JSON.stringify(parameters)
		);
	};

	/**
	 * Update an address book in a specific backend
	 *
	 * @param string backend
	 * @param string addressBookId Address book ID
	 * @param object params An object {displayname:"My contacts", description:""}
	 * @return An array containing contact data e.g.:
	 * {
	 * metadata:
	 * {
	 *     id:'1234'
	 *     permissions:31,
	 *     displayname:'My contacts',
	 *     lastmodified: (unix timestamp),
	 *     owner: 'joye',
	 * }
	 */
	Storage.prototype.updateAddressBook = function(backend, addressBookId, properties) {
		console.log('Storage.updateAddressBook', backend, addressBookId, properties);
		return this.requestRoute(
			'addressbook/{backend}/{addressBookId}',
			'POST',
			{backend: backend, addressBookId: addressBookId},
			JSON.stringify(properties)
		);
	};

	/**
	 * Delete an address book from a specific backend
	 *
	 * @param string backend
	 * @param string addressBookId Address book ID
	 */
	Storage.prototype.deleteAddressBook = function(backend, addressBookId) {
		var key = 'contacts::' + backend + '::' + addressBookId;

		if(this.hasLocalStorage() && OC.localStorage.hasItem(key)) {
			OC.localStorage.removeItem(key);
		}

		console.log('Storage.deleteAddressBook', backend, addressBookId);
		return this.requestRoute(
			'addressbook/{backend}/{addressBookId}',
			'DELETE',
			{backend: backend, addressBookId: addressBookId}
		);
	};

	/**
	 * (De)active an address book from a specific backend
	 *
	 * @param string backend
	 * @param string addressBookId Address book ID
	 * @param bool state
	 */
	Storage.prototype.activateAddressBook = function(backend, addressBookId, state) {
		console.log('Storage.activateAddressBook', backend, addressBookId, state);
		return this.requestRoute(
			'addressbook/{backend}/{addressBookId}/activate',
			'POST',
			{backend: backend, addressBookId: addressBookId},
			JSON.stringify({state: state})
		);
	};
	
	/**
	 * Update an address book in a specific backend
	 *
	 * @param string backend
	 * @param string addressBookId Address book ID
	 * @param object params An object {displayname:"My contacts", description:""}
	 * @return An array containing contact data e.g.:
	 * {
	 * metadata:
	 * {
	 *     id:'1234'
	 *     permissions:31,
	 *     displayname:'My contacts',
	 *     lastmodified: (unix timestamp),
	 *     owner: 'joye',
	 * }
	 */
	Storage.prototype.getConnectors = function(backend) {
		console.log('Storage.getConnectors', backend);
		return this.requestRoute(
			'connectors/{backend}',
			'GET',
			{backend: backend}
		);
	};

	/**
	 * Get metadata from an address book from a specific backend
	 *
	 * @param string backend
	 * @param string addressBookId Address book ID
	 * @return
	 *
	 * metadata:
	 * {
	 *     id:'1234'
	 *     permissions:31,
	 *     displayname:'Contacts',
	 *     lastmodified: (unix timestamp),
	 *     owner: 'joye'
	 * }
	 */
	Storage.prototype.getAddressBook = function(backend, addressBookId) {
		var defer = $.Deferred();

		$.when(this.requestRoute(
			'addressbook/{backend}/{addressBookId}',
			'GET',
			{backend: backend, addressBookId: addressBookId},
			''
		))
		.then(function(response) {
			console.log('response', response);
			defer.resolve(response);
		})
		.fail(function(response) {
			console.warn('Request Failed:', response.message);
			defer.reject(response);
		});
		return defer;
	};

	/**
	 * Get contacts from an address book from a specific backend
	 *
	 * @param string backend
	 * @param string addressBookId Address book ID
	 * @return
	 * An array containing contact data e.g.:
	 * {
	 * metadata:
	 * {
	 *     id:'1234'
	 *     permissions:31,
	 *     displayname:'John Q. Public',
	 *     lastmodified: (unix timestamp),
	 *     owner: 'joye',
	 *     parent: (id of the parent address book)
	 *     data: //array of VCard data
	 * }
	 */
	Storage.prototype.getContacts = function(backend, addressBookId) {
        weave.util.Log.debug("Storage.getContacts()");
        
		var self = this;
		var headers = {};
	    var data = null;
		var defer = $.Deferred();

        var modifiedLocal  = null;
        var modifiedRemote = null;
        
		var keyModified = 'contacts::' + backend + '::' + addressBookId + '::modified';
		//if(this.hasLocalStorage() && OC.localStorage.hasItem(keyModified)) {
		//	modifiedLocal = OC.localStorage.getItem(keyModified);
		//}

		OC.localStorage.getItem(keyModified)
            .then(function(modified) {
                if (modified) {
                    modifiedLocal = modified;
                }
                return $.Deferred().resolve(true);
            })
            .then(function() {
                return self.initWeaveClient();
            })
            .then(function() {                
                var wcDefer = $.Deferred();
                self.weaveClient.getCollectionInfo('exfiocontacts')
                    .then(function(colinfo) {
                        wcDefer.resolve(colinfo);
                    })
                    .fail(function(error) {
                        wcDefer.reject(error);
                    });
                return wcDefer.promise();
            })
            .then(function(colinfo) {
                var wcDefer = $.Deferred();
                
                //FIXME - support If-Modified-Since header to prevent unecessary sending of data
                modifiedRemote = colinfo.modified;
                
                self.weaveClient.getCollection('exfiocontacts', null, null, null, null, null, null, null, null, null, true, true)
                    .then(function(wbos) {
                        weave.util.Log.debug("wbos 1: " + JSON.stringify(wbos));
                        wcDefer.resolve(wbos);
                    })
                    .fail(function(error) {
                        wcDefer.reject(error);
                    });
                return wcDefer.promise();
            })
            .then(function(wbos) {
                weave.util.Log.debug("wbos 2: " + JSON.stringify(wbos));
                if ( Object.prototype.toString.call(wbos) !== '[object Array]' ) {
                    defer.reject({error:true, message: "Weave Sync payload invalid"});
                    return;
                }

                var promiseStorageContacts = [];
                var ocContacts = [];            
                for (var i = 0; i < wbos.length; i++) {
                    var wbo = wbos[i];

                    //cache encyrpted copy of wbo to support 'patching' of subset of properties
                    var encWbo = new weave.storage.WeaveBasicObject();
                    encWbo.fromJSONObject(wbo.toJSONObject());
                    encWbo.payload = weave.crypto.PayloadCipher.encrypt(encWbo.payload, self.keyPair);
		            var keyContact = 'contacts::' + backend + '::' + addressBookId + '::contact::' + encWbo.id;
			        promiseStorageContacts.push(OC.localStorage.setItem(keyContact, encWbo));
                    
                    var contact = {
                        metadata: {
                            id: wbo.id,
                            permissions: 31, //TODO - confirm meaning of default
                            displayname: "", //get FN from vcard props
                            lastmodified: Math.floor(wbo.modified),
                            owner: "foo", //FIXME - confirm default
                            backend: backend,
                            parent: addressBookId,
                        },
                        data: {}
                    };
                    
                    var jcardData = JSON.parse(wbo.payload);
                    if ( 
                        !(
                            Object.prototype.toString.call(jcardData) === '[object Array]'
                                && jcardData[0].toLowerCase() === 'vcard' 
                                && Object.prototype.toString.call(jcardData[1]) === '[object Array]'
                        ) 
                    ) {
                        console.warn("Weave Sync payload invalid");
                        continue;
                    }

                    //var jcardProps = jcardData[1];
                    //for (var j = 0; j < jcardProps.length; j++) {
                    //    var prop = jcardProps[j];
                    //    var propName = prop[0].toUpperCase();
                    //    var jcardProp = new ICAL.Property(prop);

                    var jcardComponent = new ICAL.Component(jcardData);
                    var jcardProps = jcardComponent.getAllProperties();
                    for (var j = 0; j < jcardProps.length; j++) {
                        var jcardProp = jcardProps[j];
                        var propName = jcardProp.name.toUpperCase();
                        var prop = jcardProp.toJSON();
                        
                        console.debug("jcard prop: " + JSON.stringify(jcardProp.toJSON()));
                        var propChecksum = md5(JSON.sortify(jcardProp.toJSON()));

                        //Normalise parameters
                        var propParameters = {};
                        for (var key in prop[1]) {
                            var val = prop[1][key];

                            //Make type value an array
                            if ( key.toLowerCase() === 'type' && !(val instanceof Array) ) {
                                val = [val];
                            }
                            
                            //Transform parameter keys and values to lower case
                            if ( val instanceof String ) {
                                val = val.toLowerCase();
                            } else if ( val instanceof Array ) {
                                var tmpval = val.map(function(item) { return item.toLowerCase() });
                                val = tmpval;
                            }
                            propParameters[key.toLowerCase()] = val;
                        }

                        if ( propName == 'FN' ) {
                            contact.metadata.displayname = prop[3];
                        }

                        switch(propName) {
                            
                        case 'CLIENTPIDMAP':
                        case 'GENDER':
                        case 'ORG':
                            //FIXME - implement structured
                            break;
                        case 'NICKNAME':
                            //FIXME - implement multivalue
                            break;
                        case 'ADR':
                        case 'N':
                            //FIXME - implement structured multivalue
                            break;
                        default:                            
                            if ( !(propName in contact.data) ) {
                                contact.data[propName] = [];
                            }
                            contact.data[propName].push({
                                value: prop[3],
                                parameters: propParameters,
                                checksum: propChecksum
                            });
                            //contact.data[propName].push({
                            //    value: jcardProp.getFirstValue(),
                            //    parameters: jcardProp.getParameters(),
                            //    checksum: propChecksum
                            //});
                            break;
                        }
                    }
                    
                    ocContacts.push(contact);
                }

                //chrome.storage.local.get(null, function(items) {
                //    console.debug("local storage: " + JSON.stringify(items));
                //});
                
                //FIXME - populate with valid ETag and statusCode values
                var status = 200;
                var etag = "foo";
                
                var response = {data: {error: false, statusCode: status, Etag: etag, contacts: ocContacts}};

                $.when.apply($, promiseStorageContacts)
                    .then(
			            OC.localStorage.setItem(keyModified, modifiedRemote)
                    )                
                    .then(function() {
                        defer.resolve(response);
                    });
		    })
		    .fail(function(response) {
			    console.warn('Request Failed:', response.message);
			    defer.reject(response);
		    });
        
	    return defer.promise();
	};

	/**
	 * Add a contact to an address book from a specific backend
	 *
	 * @param string backend
	 * @param string addressBookId Address book ID
	 * @return An array containing contact data e.g.:
	 * {
	 * metadata:
	 *     {
	 *     id:'1234'
	 *     permissions:31,
	 *     displayname:'John Q. Public',
	 *     lastmodified: (unix timestamp),
	 *     owner: 'joye',
	 *     parent: (id of the parent address book)
	 *     data: //array of VCard data
	 * }
	 */
	Storage.prototype.addContact = function(backend, addressBookId) {
		console.log('Storage.addContact', backend, addressBookId);
        
        //return skeleton contact with uid only
        var uid = uuid.v4();
        var contact = {
            metadata: {
                id: uid,
                permissions: 31, //TODO - confirm meaning of default
                displayname: "", //get FN from vcard props
                lastmodified: null,
                owner: "foo", //FIXME - confirm default
                backend: backend,
                parent: addressBookId
            },
            data: {}
        };

        //Write wbo to local storage
        var keyContact = 'contacts::' + backend + '::' + addressBookId + '::contact::' + uid;

        var jcardComponent = new ICAL.Component("vcard");
        jcardComponent.addPropertyWithValue("uid", uid);
        var payload = JSON.stringify(jcardComponent.toJSON());
        
        var wbo = new weave.storage.WeaveBasicObject();
        wbo.id = uid;
        wbo.payload = weave.crypto.PayloadCipher.encrypt(payload, this.keyPair);

        return OC.localStorage.setItem(keyContact, wbo)
            .then(function() {
                return $.when(contact);
            });
        
        /*
		return this.requestRoute(
			'addressbook/{backend}/{addressBookId}/contact/add',
			'POST',
			{backend: backend, addressBookId: addressBookId}
		);
        */
	};

	/**
	 * Delete a contact from an address book from a specific backend
	 *
	 * @param string backend
	 * @param string addressBookId Address book ID
	 * @param string contactId Address book ID
	 */
	Storage.prototype.deleteContact = function(backend, addressBookId, contactId) {
		console.log('Storage.deleteContact', backend, addressBookId, contactId);

        var self = this;

        var keyContact = 'contacts::' + backend + '::' + addressBookId + '::contact::' + contactId;        

        var defer = $.Deferred();

        //delete contact from remote storage
        self.weaveClient.delete('exfiocontacts', contactId)
            .then(function() {
                defer.resolve({error:false});
            })
            .fail(function(error) {
                defer.reject({error:true, message:error});
            });

        return defer.promise()
            .then(function() {
                //delete from local storage
                return OC.localStorage.removeItem(keyContact)
            })
            .then(function() {
                return $.when({error:false});
            })
            .fail(function(error) {
                var message = error.message ? error.message : error;
                console.error("Couldn't delete contact - " + message);
            });
        
		/*
		return this.requestRoute(
			'addressbook/{backend}/{addressBookId}/contact/{contactId}',
			'DELETE',
			{backend: backend, addressBookId: addressBookId, contactId: contactId}
		);
		*/
	};

	/**
	 * Delete a list of contacts from an address book from a specific backend
	 *
	 * @param string backend
	 * @param string addressBookId Address book ID
	 * @param array contactIds Address book ID
	 */
	Storage.prototype.deleteContacts = function(backend, addressBookId, contactIds) {
		console.log('Storage.deleteContacts', backend, addressBookId, contactIds);
		return this.requestRoute(
			'addressbook/{backend}/{addressBookId}/deleteContacts',
			'POST',
			{backend: backend, addressBookId: addressBookId},
			JSON.stringify({contacts: contactIds})
		);
	};

	/**
	 * Move a contact to an address book from a specific backend
	 *
	 * @param string backend
	 * @param string addressBookId Address book ID
	 * @param string contactId Address book ID
	 */
	Storage.prototype.moveContact = function(backend, addressBookId, contactId, target) {
		console.log('Storage.moveContact', backend, addressBookId, contactId, target);
		return this.requestRoute(
			'addressbook/{backend}/{addressBookId}/contact/{contactId}',
			'POST',
			{backend: backend, addressBookId: addressBookId, contactId: contactId},
			JSON.stringify(target)
		);
	};

	/**
	 * Get Image instance for a contacts profile picture
	 *
	 * @param string backend
	 * @param string addressBookId Address book ID
	 * @param string contactId Address book ID
	 * @return Image
	 */
	Storage.prototype.getContactPhoto = function(backend, addressBookId, contactId) {
		var photo = new Image();
		var url = OC.generateUrl(
			'apps/contacts/addressbook/{backend}/{addressBookId}/contact/{contactId}/photo',
			{backend: backend, addressBookId: addressBookId, contactId: contactId}
		);
		var defer = $.Deferred();

		$.when(
			$(photo).on('load', function() {
				defer.resolve(photo);
			})
			.error(function() {
				console.log('Error loading contact photo');
				defer.reject();
			})
			.attr('src', url + '?refresh=' + Math.random())
		)
		.fail(function(jqxhr, textStatus, error) {
			defer.reject();
			var err = textStatus + ', ' + error;
			console.warn('Request Failed:', + err);
			$(document).trigger('status.contact.error', {
				message: t('contacts', 'Failed loading photo: {error}', {error:err})
			});
		});
		return defer.promise();
	};

	/**
	 * Get Image instance for cropping contacts profile picture
	 *
	 * @param string backend
	 * @param string addressBookId Address book ID
	 * @param string contactId Address book ID
	 * @param string key The key to the cache where the photo is stored.
	 * @return Image
	 */
	Storage.prototype.getTempContactPhoto = function(backend, addressBookId, contactId, key) {
		var photo = new Image();
		var url = OC.generateUrl(
			'apps/contacts/addressbook/{backend}/{addressBookId}/contact/{contactId}/photo/{key}/tmp',
			{backend: backend, addressBookId: addressBookId, contactId: contactId, key: key, refresh: Math.random()}
		);
		console.log('url', url);
		var defer = $.Deferred();

		$.when(
			$(photo).on('load', function() {
				defer.resolve(photo);
			})
			.error(function(event) {
				console.warn('Error loading temporary photo', event);
				defer.reject();
			})
			.attr('src', url)
		)
		.fail(function(jqxhr, textStatus, error) {
			defer.reject();
			var err = textStatus + ', ' + error;
			console.warn('Request Failed:', err);
			$(document).trigger('status.contact.error', {
				message: t('contacts', 'Failed loading photo: {error}', {error:err})
			});
		});
		return defer.promise();
	};

	/**
	 * Crop a contact phot.
	 *
	 * @param string backend
	 * @param string addressBookId Address book ID
	 * @param string contactId Contact ID
	 * @param string key The key to the cache where the temporary image is saved.
	 * @param object coords An object with the properties: x, y, w, h
	 */
	Storage.prototype.cropContactPhoto = function(backend, addressBookId, contactId, key, coords) {
		return this.requestRoute(
			'addressbook/{backend}/{addressBookId}/contact/{contactId}/photo/{key}/crop',
			'POST',
			{backend: backend, addressBookId: addressBookId, contactId: contactId, key: key},
			JSON.stringify(coords)
		);
	};

	/**
	 * Update a contact.
	 *
	 * @param string backend
	 * @param string addressBookId Address book ID
	 * @param string contactId Contact ID
	 * @param object params An object with the following properties:
	 * @param string name The name of the property e.g. EMAIL.
	 * @param string|array|null value The of the property
	 * @param array parameters Optional parameters for the property
	 * @param string checksum For non-singular properties such as email this must contain
	 *               an 8 character md5 checksum of the serialized \Sabre\Property
	 */
	Storage.prototype.patchContact = function(backend, addressBookId, contactId, params) {
		console.log('Storage.patchContact', params);

        var self = this;
        
        //patch local contact then update remote collection

        var oldchecksum = ((params && typeof params.checksum !== 'undefined') ? params.checksum : null);
        
        var response = {
            data: {
                lastmodified: null
            }
        };
        
        var keyContact = 'contacts::' + backend + '::' + addressBookId + '::contact::' + contactId;
        
        //1. load contact from local storage
		return OC.localStorage.getItem(keyContact)
            .then(function(wboJson) {
                if (wboJson === null) {
                    return $.Deferred().reject("Contact id '" + contactId + "'not found in local storage");
                }
                var wbo = new weave.storage.WeaveBasicObject();
                wbo.fromJSONObject(wboJson);
                wbo.payload = weave.crypto.PayloadCipher.decrypt(wbo.payload, self.keyPair);
                return $.when(wbo);
            })
            .then(function(wbo) {
                //2. apply change
                
                console.debug("jcard in: " + wbo.payload);
                var jcardObject = JSON.parse(wbo.payload);
                var jcardComponent = new ICAL.Component(jcardObject);

                //TODO - check for cardinality * and 1* here
                //var jcardProp = jcardComponent.getFirstProperty(params.name.toLowerCase());
                var jcardProp = null;
                var jcardProps = jcardComponent.getAllProperties(params.name.toLowerCase());

                //first remove old property
                if ( oldchecksum === null ) {
                    //single property, make sure we remove old one if it exists
                    if ( jcardProps.length == 0 ) {
                        //new property, nothing to do
                    } else if ( jcardProps.length == 1 ) {
                        jcardProp = jcardProps[0];
                        console.debug("jcard prop in: '" + jcardProp.name + "':" + JSON.stringify(jcardProp.toJSON()));

                        jcardComponent.removeProperty(jcardProp);
                    } else {
                        throw new Error("Multiple matching properties");
                    }
                    
                } else if ( oldchecksum === 'new' ) {
                    //new multi property, nothing to do
                } else {
                    //existing multi property, find it and remove it
                    if ( jcardProps.length == 1 ) {
                        jcardProp = jcardProps[0];
                    } else if ( jcardProps.length > 1 ) {
                        for (var i = 0; i < jcardProps.length; i++) {
                            var propChecksum = md5(JSON.sortify(jcardProps[i].toJSON()));
                            if ( oldchecksum == propChecksum ) {
                                jcardProp = jcardProps[i];
                                break;
                            }
                        }
                    }

                    if ( jcardProp === null ) {
                        throw new Error("Couldn't find property to patch");
                    }

                    console.debug("jcard prop in: '" + jcardProp.name + "':" + JSON.stringify(jcardProp.toJSON()));

                    jcardComponent.removeProperty(jcardProp);
                }

                jcardProp = new ICAL.Property(params.name.toLowerCase());
                
                if (typeof params.value === 'array') {
                    //TODO - check if property type is multi-value
                    jcardProp.setValues(params.value);
                } else {
                    jcardProp.setValue(params.value);  
                }
                
                if ( 'parameters' in params ) {
                    for (var key in params.parameters) {
                        //jcardProp.setParameter(key, params.parameters[key]);
                        //transform parameter keys and values to lower case
                        var val = params.parameters[key];
                        if ( val instanceof Array ) {
                            var tmpval = val.map(function(item) { return item.toLowerCase() });
                            val = tmpval;
                        }
                        jcardProp.setParameter(key.toLowerCase(), val);
                    }
                }

                //patch jcal property
                jcardComponent.addProperty(jcardProp);                

                console.debug("jcard prop out: '" + jcardProp.name + "':" + JSON.stringify(jcardProp.toJSON()));
                console.debug("jcard out: " + JSON.stringify(jcardComponent.toJSON()));

                if ( oldchecksum ) {
                    response.data.checksum = md5(JSON.sortify(jcardProp.toJSON()));
                }
                
                //Update wbo
                wbo.payload = JSON.stringify(jcardComponent.toJSON());

                return $.when(wbo);

                //response.data.lastmodified = wbo.modified;
                //if ( oldchecksum ) {
                //    response.data.checksum = oldchecksum;
                //}
                //return $.when(response);
            })
            .then(function(wbo) {
                //3. update remote collection        
                var defer = $.Deferred();
                
                self.weaveClient.put('exfiocontacts', contactId, wbo)
                    .then(function(modified) {
                        wbo.modified = modified;
                        defer.resolve(wbo);
                    })
                    .fail(function(error) {
                        defer.reject(error);
                    });

                return defer.promise();
            })
            .then(function(wbo) {
                //4. update local storage
                wbo.payload = weave.crypto.PayloadCipher.encrypt(wbo.payload, self.keyPair);
                return OC.localStorage.setItem(keyContact, wbo)
                    .then(function() {
                        response.data.lastmodified = wbo.modified;
                        return $.when(response);
                    });
            })
            .fail(function(error) {
                console.error("Couldn't patch contact - " + error);
            });
        
        /*
		return this.requestRoute(
			'addressbook/{backend}/{addressBookId}/contact/{contactId}',
			'PATCH',
			{backend: backend, addressBookId: addressBookId, contactId: contactId},
			JSON.stringify(params)
		);
        */
	};

	/**
	 * Save all properties. Used when merging contacts.
	 *
	 * @param string backend
	 * @param string addressBookId Address book ID
	 * @param string contactId Contact ID
	 * @param object params An object with the all properties:
	 */
	Storage.prototype.saveAllProperties = function(backend, addressBookId, contactId, params) {
		console.log('Storage.saveAllProperties', params);
		return this.requestRoute(
			'addressbook/{backend}/{addressBookId}/contact/{contactId}/save',
			'POST',
			{backend: backend, addressBookId: addressBookId, contactId: contactId},
			JSON.stringify(params)
		);
	};

	/**
	 * Get all groups for this user.
	 *
	 * @return An array containing the groups, the favorites, any shared
	 * address books, the last selected group and the sort order of the groups.
	 * {
	 *     'categories': [{'id':1',Family'}, {...}],
	 *     'favorites': [123,456],
	 *     'shared': [],
	 *     'lastgroup':'1',
	 *     'sortorder':'3,2,4'
	 * }
	 */
    Storage.prototype.getGroupsForUser = function() {
        //FIXME - Implement in Weave backend
        //set to default values
        var response = {
            statusCode: 200,
            error: false,
            metadata: {},
            data: {
	            'categories': [],
	            'favorites': [],
	            'shared': [],
	            'lastgroup':'1',
	            'sortorder':'1'
            }
        };

        var defer = $.Deferred();
	    defer.resolve(response);
		return defer.promise();

        /*
		console.log('getGroupsForUser');
		return this.requestRoute(
			'groups/',
			'GET',
			{}
		);
        */
	};

	/**
	 * Add a group
	 *
	 * @param string name
	 * @return A JSON object containing the (maybe sanitized) group name and its ID:
	 * {
	 *     'id':1234,
	 *     'name':'My group'
	 * }
	 */
	Storage.prototype.addGroup = function(name) {
		console.log('Storage.addGroup', name);
		return this.requestRoute(
			'groups/add',
			'POST',
			{},
			JSON.stringify({name: name})
		);
	};

	/**
	 * Delete a group
	 *
	 * @param string name
	 */
	Storage.prototype.deleteGroup = function(id, name) {
		return this.requestRoute(
			'groups/delete',
			'POST',
			{},
			JSON.stringify({id: id, name: name})
		);
	};

	/**
	 * Rename a group
	 *
	 * @param string from
	 * @param string to
	 */
	Storage.prototype.renameGroup = function(from, to) {
		return this.requestRoute(
			'groups/rename',
			'POST',
			{},
			JSON.stringify({from: from, to: to})
		);
	};

	/**
	 * Add contacts to a group
	 *
	 * @param array contactIds
	 */
	Storage.prototype.addToGroup = function(contactIds, categoryId, categoryName) {
		console.log('Storage.addToGroup', contactIds, categoryId);
		return this.requestRoute(
			'groups/addto/{categoryId}',
			'POST',
			{categoryId: categoryId},
			JSON.stringify({contactIds: contactIds, name: categoryName})
		);
	};

	/**
	 * Remove contacts from a group
	 *
	 * @param array contactIds
	 */
	Storage.prototype.removeFromGroup = function(contactIds, categoryId, categoryName) {
		console.log('Storage.removeFromGroup', contactIds, categoryId);
		return this.requestRoute(
			'groups/removefrom/{categoryId}',
			'POST',
			{categoryId: categoryId},
			JSON.stringify({contactIds: contactIds, name: categoryName})
		);
	};

	/**
	 * Set a user preference
	 *
	 * @param string key
	 * @param string value
	 */
    Storage.prototype.setPreference = function(key, value) {
        //FIXME - save using local storage
        return $.when({});
        /*
		return this.requestRoute(
			'preference/set',
			'POST',
			{},
			JSON.stringify({key: key, value:value})
		);
        */
	};

	Storage.prototype.prepareImport = function(backend, addressBookId, importType, params) {
		console.log('Storage.prepareImport', backend, addressBookId, importType);
		return this.requestRoute(
			'addressbook/{backend}/{addressBookId}/{importType}/import/prepare',
			'POST',
			{backend: backend, addressBookId: addressBookId, importType: importType},
			JSON.stringify(params)
		);
	};

	Storage.prototype.startImport = function(backend, addressBookId, importType, params) {
		console.log('Storage.startImport', backend, addressBookId, importType);
		return this.requestRoute(
			'addressbook/{backend}/{addressBookId}/{importType}/import/start',
			'POST',
			{backend: backend, addressBookId: addressBookId, importType: importType},
			JSON.stringify(params)
		);
	};

	Storage.prototype.importStatus = function(backend, addressBookId, importType, params) {
		return this.requestRoute(
			'addressbook/{backend}/{addressBookId}/{importType}/import/status',
			'GET',
			{backend: backend, addressBookId: addressBookId, importType: importType},
			params
		);
	};
	
	Storage.prototype.requestRoute = function(route, type, routeParams, params, additionalHeaders) {
		var isJSON = (typeof params === 'string');
		var contentType = isJSON
			? (type === 'PATCH' ? 'application/json-merge-patch' : 'application/json')
			: 'application/x-www-form-urlencoded';
		var processData = !isJSON;
		contentType += '; charset=UTF-8';
		var url = OC.generateUrl('apps/contacts/' + route, routeParams);
		var headers = {
			Accept : 'application/json; charset=utf-8'
		};
		if(typeof additionalHeaders === 'object') {
			headers = $.extend(headers, additionalHeaders);
		}
		var ajaxParams = {
			type: type,
			url: url,
			dataType: 'json',
			headers: headers,
			contentType: contentType,
			processData: processData,
			data: params
		};

		var defer = $.Deferred();

		$.ajax(ajaxParams)
			.done(function(response, textStatus, jqXHR) {
				console.log(jqXHR);
				defer.resolve(new JSONResponse(jqXHR));
			})
			.fail(function(jqXHR/*, textStatus, error*/) {
				console.log(jqXHR);
				var response = jqXHR.responseText ? $.parseJSON(jqXHR.responseText) : null;
				console.log('response', response);
				defer.reject(new JSONResponse(jqXHR));
			});

		return defer.promise();
	};

	OC.Contacts.Storage = Storage;

})(window, jQuery, OC, CSync);
