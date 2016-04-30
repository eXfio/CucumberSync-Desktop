CSync = (typeof window !== "undefined" ? window['CSync'] : typeof global !== "undefined" ? global['CSync'] : null) || {};
$ = (typeof window !== "undefined" ? window['$'] : typeof global !== "undefined" ? global['$'] : null);

(function($, CSync) {
  'use strict';

  var FxAccount = function() {
    this.weaveAccount = null;
  };
  
  FxAccount.prototype = {
    'ACCOUNT_TYPE': 'fxa',
    'NAME': 'Firefox Account (FxA)',
    'TEMPLATE': 'fxaSignInTemplate',
    'DEFAULT_ACCOUNT_SERVER': "https://api.accounts.firefox.com/v1",
	'DEFAULT_TOKEN_SERVER': "https://cucumbersync.com/token/1.0/sync/1.5",
    
	init: function(accountSettings) {
      weave.util.Log.debug("FxAccount.init()");
      
      var self = this;
      var defer = $.Deferred();
      
      var weaveParams = accountSettings;
      weave.util.Log.debug("Call weave.account.fxa.FxAccount.init() with params: " + JSON.stringify(weaveParams));
      
      this.weaveAccount = new weave.account.fxa.FxAccount();      
      this.weaveAccount.init(weaveParams)
        .then(function() {
          console.log("Success, we have a valid sync auth token");
          defer.resolve(true);
        })
        .fail(function(error) {
          weave.util.Log.error("Couldn't initialise weave account - " + error);
          defer.reject(error);
        });
      
      return defer.promise();
    },

    isInitialized: function() {
      return (typeof this.weaveAccount === 'object' && this.weaveAccount.isInitialized());
    },

    getWeaveAccount: function() {
      return this.weaveAccount;
    },
    
    signInDialog: function(cb) {

        //TODO - port FxA content server SignIn / SignUp
        //For now render ocdialog
        
	    var $parent = $('body');
		$parent.append('<div id="account-signin-dialog"></div>');
		var $dlg = $('#' + this.TEMPLATE).clone().octemplate();
		var $divDlg = $('#account-signin-dialog');
		var self = this;
        
		$divDlg.html($dlg).ocdialog({
		  modal: true,
		  closeOnEscape: true,
		  title: t('contacts', 'Sign In'),
		  height: 'auto',
		  width: 'auto',
		  buttons: [
			{
			  text: t('contacts', 'Sign In'),
			  click: function() {
				self.signIn()
                  .then(function() {
                    console.log("Sign in successful");
                    cb({error: false});
			        $('#account-signin-dialog').ocdialog('close');
                  })
                  .fail(function(error) {
                    var message = "Sign in failed - " + error;
                    console.warn(message);
                    cb({error: true, message: message});
			        $('#account-signin-dialog').ocdialog('close');
                  });
			  },
			  defaultButton: true
			}
		  ],
		  close: function() {
			$('#account-signin-dialog').ocdialog('close').ocdialog('destroy').remove();
		  },
		  open: function() {
            //Nothin to do
		  }
		});
      },
      signIn: function() {
        var defer = $.Deferred();
        
		var username      = $('#fxa-signin-username').val();
        var password      = $('#fxa-signin-password').val();
        var accountServer = this.DEFAULT_ACCOUNT_SERVER;
        var tokenServer   = this.DEFAULT_TOKEN_SERVER;

        //FIXME - initialise devEnv values during build
        var devEnv = false;
        if ( devEnv ) {
          accountServer = "http://argent.local:9000/v1";
          tokenServer   = "http://argent.local:5000/token/1.0/sync/1.5";
        }

        //FIXME - actually signin and save longlived auth token
        //For now just save account params

        //TODO - improve validation
        if (
          !(
            (typeof username === 'string' && username.length > 0)
            && (typeof password === 'string' && password.length > 0)
            && (typeof accountServer === 'string' && accountServer.length > 0)
            && (typeof tokenServer === 'string' && tokenServer.length > 0)
          )
        ) {
          var message = "Username and password required"; 
          console.warn(message);
          return defer.reject(message);
        }
        
        var accountSettings = {
          accountType:   this.ACCOUNT_TYPE,
          user:          username,
          password:      password,
          accountServer: this.DEFAULT_ACCOUNT_SERVER,
          tokenServer:   this.DEFAULT_TOKEN_SERVER
        };

        //Re-authenticate to token server
        this.init(accountSettings)
          .then(function() {
            return CSync.AccountFactory.storeAccountSettings(accountSettings);
          })
          .then(function() {
            defer.resolve(true);
          })
          .fail(function(error) {
            defer.reject(error);
          });
            
        return defer.promise();
	  }
  };

  var CSyncAccount = function() {
    FxAccount.call(this);
  };

  CSyncAccount.prototype = Object.create(FxAccount.prototype);
  CSyncAccount.prototype.constructor = CSyncAccount;

  CSyncAccount.prototype.ACCOUNT_TYPE           = 'csync';
  CSyncAccount.prototype.NAME                   = 'CucumberSync Account';
  CSyncAccount.prototype.DEFAULT_ACCOUNT_SERVER = "https://api.accounts.cucumbersync.com/v1";
  CSyncAccount.prototype.DEFAULT_TOKEN_SERVER   = "https://cucumbersync.com/token/1.0/sync/1.5";

  CSync.Account = {
    fxa: FxAccount,
    csync: CSyncAccount
  };

  CSync.AccountFactory = (function() {
    return {
      initFromStorage: function() {
        console.log("initFromStorage()");
        var self = this;
        
        return this.loadAccountSettings()
          .then(function(accountSettings) {
            if (accountSettings === null) {
              return $.Deferred().reject("Account settings not found");
            }
            CSync.account = self.getInstance(accountSettings.accountType);
            return CSync.account.init(accountSettings);
          });
      },

      initFromSignIn: function(accountType) {
        console.log("initFromSignIn()");

        var self = this;
        var defer = $.Deferred();
        
        CSync.account = CSync.AccountFactory.getInstance(accountType);
        CSync.account.signInDialog(function(result) {
            if (result.error) {
                defer.reject(result.message);
            } else {
                defer.resolve(true);
            }
        });

        return defer.promise();        
      },

      loadAccountSettings: function() {
        weave.util.Log.debug("AccountFactory.loadAccountSettings()");
        
        var self = this;
        
        var defer = $.Deferred();
      
        chrome.storage.local.get({
          accountSettings: null
        }, function(items) {
          
          if (chrome.runtime.lastError) {
            weave.util.Log.error("Couldn't retrieve account settings from local stroage - " + chrome.runtime.lastError.message);
            defer.reject(chrome.runtime.lastError.message);
          } else {
            defer.resolve(items['accountSettings']);
          }
        });
        
        return defer.promise();
      },

      storeAccountSettings: function(accountSettings) {
        weave.util.Log.debug("AccountFactory.storeAccountSettings()");
        
        var self = this;
        
        var defer = $.Deferred();
      
        chrome.storage.local.set({
          accountSettings: accountSettings
        }, function() {
          
          if (chrome.runtime.lastError) {
            weave.util.Log.error("Couldn't write account settings to local stroage - " + chrome.runtime.lastError.message);
            defer.reject(chrome.runtime.lastError.message);
          } else {
            defer.resolve(true);
          }
        });
        
        return defer.promise();
      },

      getInstance: function(accountType) {
        var account = new CSync.Account[accountType]();
	    return account;
      }
    };
  })();

  CSync.clearStorage = function() {
    //Clear all storage except account settings
    var tmpAccountSettings = null;
    return CSync.AccountFactory.loadAccountSettings()
      .then(function(accountSettings) {
        tmpAccountSettings = accountSettings;
        return OC.localStorage.clear();
      })
      .then(function() {
        return CSync.AccountFactory.storeAccountSettings(tmpAccountSettings)
      });
  };
  
})($, CSync);
