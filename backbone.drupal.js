/**
 * @file
 * Integration with Drupal Services and Backbone.
 */

(function (Backbone) {

  "use strict";

  Backbone.Drupal = {};
  Backbone.Drupal.Model = {};
  Backbone.Drupal.Collection = {};

  /**
   * The user session.
   *
   * This should be bound to the app as a singleton.
   *
   * The current user model can be accessed via session.user.
   */
  Backbone.Drupal.Model.Session = Backbone.Model.extend({
    defaults: {
      loggedIn: false
    },

    /**
     * @inheritdoc
     */
    initialize: function () {
      this.user = new Backbone.Drupal.Model.User({});
    },

    /**
     * Returns whether the current user is logged in.
     *
     * @return {bool}
     *   True if the user is logged in, false if not.
     */
    loggedIn: function () {
      return this.get('loggedIn');
    },

    /**
     * Logs a user in.
     *
     * @param {string} username
     *   The username.
     * @param {string} password
     *   The password.
     *
     * @return {jQuery.Deferred}
     *   A jQuery promise that will resolve the user model.
     */
    login: function (username, password) {
      var self = this;
      var deferred = Backbone.$.Deferred();

      // User is already logged in.
      if (this.loggedIn()) {
        return deferred.resolve(this.user).promise();
      }

      this.doPost('/system/connect').done(function (data) {
        self.set('loggedIn', true);
        // If we are already logged in, there's nothing to do.
        if (data.user.uid != 0) {
          self.user.set(data.user);
          deferred.resolve(self.user);
        }
        // Perform an actual login.
        else {
          self.doPost('/user/login', {username: username, password: password})
          .done(function (data) {
            setCsrfToken(data.token);
            self.user.set(data.user);
            deferred.resolve(self.user);
          });
        }
      });

      return deferred.promise();
    },

    /**
     * Logs a user out.
     *
     * @return {jQuery.Deferred}
     *   A jQuery promise that will resolve to the logout request.
     */
    logout: function () {
      var self = this;

      return this.doPost('/user/logout')
        .done(function (data) {
          resetCsrfToken();
          self.set('loggedIn', false);
        })
        .promise();
    },

    /**
     * Performs a POST request.
     *
     * @param {string} postUrl
     *   The URL to POST to.
     * @param {object} postData
     *   Data to POST.
     *
     * @return {jqXHR}
     *   A jQuery ajax object.
     */
    doPost: function (postUrl, postData) {
      // We intentionally set this to read, and then override it by setting type
      // to POST. This stops Backbone from messing with out request.
      return this.sync('read', this, {
        type: 'POST',
        url: postUrl,
        data: postData ? JSON.stringify(postData) : null,
        contentType: 'application/json'
      });
    }

  });

  /**
   * Base model for Drupal entities.
   */
  Backbone.Drupal.Model.Entity = Backbone.Model.extend({

    /**
     * @inheritdoc
     */
    initialize: function() {
      this.idAttribute = this.constructor.idKey;
    },

    /**
     * Returns the label of the entity.
     *
     * @return {string}
     *   The entity label.
     */
    label: function () {
      return this.get(this.constructor.labelKey);
    },

    /**
     * Returns the bundle of the entity.
     *
     * @return {string}
     *   The bundle value, or null if the entity does not have a bundle.
     */
    bundle: function () {
      return this.constructor.bundleKey === null ? null : this.get(this.constructor.bundleKey);
    },

    /**
     * @inheritdoc
     */
    url: function () {
      var root = '/' + this.constructor.entityType;

      if (this.isNew()) {
        return root;
      }

      return root + '/' + encodeURIComponent(this.get(this.constructor.idKey));
    },

    /**
     * @inheritdoc
     */
    toJSON: function (options) {
      var attributes = Backbone.Model.prototype.toJSON.call(this, options);

      _.each(this.constructor.integerFields, function (key) {
        if (typeof attributes[key] !== 'undefined') {
          attributes[key]  = this.convertInteger(attributes[key]);
        }
      }, this);

      // Convert boolean fields.
      _.each(this.constructor.booleanFields, function (key) {
        if (typeof attributes[key] !== 'undefined') {
          attributes[key] = this.convertBoolOutput(attributes[key]);
        }
      }, this);

      // Save a bit of bandwidth.
      delete attributes.rdf_mapping;

      return attributes;
    },

    /**
     * @inheritdoc
     */
    set: function(key, val, options) {
      if (key == null) {
        return this;
      }

      // Handle both `"key", value` and `{key: value}` -style arguments.
      var attrs;
      if (typeof key === 'object') {
        attrs = key;
        options = val;
      }
      else {
        (attrs = {})[key] = val;
      }

      attrs = this.cleanInput(attrs);

      return Backbone.Model.prototype.set.call(this, attrs, options);
    },

    /**
     * Cleans input values.
     *
     * @param {object} values
     *   A value map.
     *
     * @return {object}
     *   A cleaned value map.
     */
    cleanInput: function (values) {
      _.each(this.constructor.integerFields, function (key) {
        if (typeof values[key] !== 'undefined') {
          values[key]  = this.convertInteger(values[key]);
        }
      }, this);

      // Convert boolean fields.
      _.each(this.constructor.booleanFields, function (key) {
        if (typeof values[key] !== 'undefined') {
          values[key] = this.convertBoolInput(values[key]);
        }
      }, this);

      if (typeof values[this.constructor.idKey] !== 'undefined') {
        values[this.constructor.idKey] = this.convertInteger(values[this.constructor.idKey]);
      }

      return values;
    },

    /**
     * Converts boolean values that come from Services.
     *
     * @param {mixed} value
     *   The value to convert.
     *
     * @return {bool}
     *   The converted value.
     */
    convertBoolInput: function (value) {
      if (typeof value === 'boolean') {
        return value;
      }

      value = parseInt(value);

      return isNaN(value) ? false : value > 0;
    },

    /**
     * Converts boolean values to values Services can handle.
     *
     * @see http://drupal.org/node/1511662 and http://drupal.org/node/1561292
     *
     * @param {mixed} value
     *   The value to convert.
     *
     * @return {true|null}
     *   The converted value.
     */
    convertBoolOutput: function (value) {
      if (typeof value === 'number') {
        return value > 0 ? true : null;
      }

      if (typeof value === 'boolean') {
        return value ? true : null;
      }

      if (value === '1' || value === 'true') {
        return true;
      }

      return null;
    },

    /**
     * Converts a value to an integer.
     *
     * @param {*} value
     *   The value to convert.
     *
     * @return {integer}
     *   The converted value.
     */
    convertInteger: function (value) {
      if (typeof value === 'boolean') {
        return value ? 1 : 0;
      }

      value = parseInt(value);

      return isNaN(value) ? 0 : value;
    }
  },

  {
    idKey: null,
    entityType: null,
    bundleKey: null,
    labelKey: null,
    booleanFields: [],
    integerFields: [],
  });

  /**
   * File model.
   */
  Backbone.Drupal.Model.File = Backbone.Drupal.Model.Entity.extend({
    fileContents: 0,
    imageStyles: 1,

    /**
     * @inheritdoc
     */
    url: function () {
      var url = Backbone.Drupal.Model.Entity.prototype.url.call(this);

      if (this.isNew()) {
        return url;
      }

      // Don't get the file contents.
      return url + '?file_contents=' + this.convertInteger(this.fileContents) + '&image_styles=' + this.convertInteger(this.imageStyles);
    },
  },

  {
    idKey: 'fid',
    entityType: 'file',
    bundleKey: 'type',
    labelKey: 'filename',
    booleanFields: [],
    integerFields: ['filesize', 'status', 'timestamp', 'uid'],
  });

  /**
   * Node model.
   */
  Backbone.Drupal.Model.Node = Backbone.Drupal.Model.Entity.extend({}, {
    idKey: 'nid',
    entityType: 'node',
    bundleKey: 'type',
    labelKey: 'title',
    booleanFields: ['status', 'sticky', 'promote'],
    integerFields: [
      'changed',
      'cid',
      'comment',
      'comment_count',
      'created',
      'last_comment_timestamp',
      'last_comment_uid',
      'revision_timestamp',
      'revision_uid',
      'tnid',
      'translate',
      'uid',
      'vid'
    ]
  });

  /**
   * Taxonomy term model.
   */
  Backbone.Drupal.Model.TaxonomyTerm = Backbone.Drupal.Model.Entity.extend({}, {
    idKey: 'tid',
    entityType: 'taxonomy_term',
    bundleKey: 'vocabulary_machine_name',
    labelKey: 'name',
    integerFields: ['vid', 'weight']
  });

  /**
   * Taxonomy vocabulary model.
   */
  Backbone.Drupal.Model.TaxonomyVocabulary = Backbone.Drupal.Model.Entity.extend({}, {
    idKey: 'vid',
    entityType: 'taxonomy_vocabulary',
    labelKey: 'name',
    integerFields: ['hierarchy', 'weight']
  });

  /**
   * User model.
   */
  Backbone.Drupal.Model.User = Backbone.Drupal.Model.Entity.extend({}, {
    idKey: 'uid',
    entityType: 'user',
    labelKey: 'name',
    integerFields: ['access', 'created', 'login', 'status']
  });

  /**
   * Base class for entity collections.
   */
  Backbone.Drupal.Collection.Entity = Backbone.Collection.extend({

    /**
     * @inheritdoc
     */
    url: function () {
      return '/' + this.model.entityType;
    },

  });

  /**
   * File collections.
   */
  Backbone.Drupal.Collection.File = Backbone.Drupal.Collection.Entity.extend({
    model: Backbone.Drupal.Model.File
  });

  /**
   * Node collections.
   */
  Backbone.Drupal.Collection.Node = Backbone.Drupal.Collection.Entity.extend({
    model: Backbone.Drupal.Model.Node
  });

  /**
   * Taxonomy term collections.
   */
  Backbone.Drupal.Collection.TaxonomyTerm = Backbone.Drupal.Collection.Entity.extend({
    model: Backbone.Drupal.Model.TaxonomyTerm
  });

  /**
   * Taxonomy vocabulary collections.
   */
  Backbone.Drupal.Collection.TaxonomyVocabulary = Backbone.Drupal.Collection.Entity.extend({
    model: Backbone.Drupal.Model.TaxonomyVocabulary
  });

  /**
   * User collections.
   */
  Backbone.Drupal.Collection.User = Backbone.Drupal.Collection.Entity.extend({
    model: Backbone.Drupal.Model.User
  });

  var _sync = Backbone.sync;

  /**
   * Overrides Backbone.sync to ensure that tokens are added to all requests.
   */
  Backbone.sync = function (method, model, options) {
    options = options || {};
    options.url = options.url || model.url();
    options.url =  Backbone.Drupal.appRoot + options.url;
    options.xhrFields = options.xhrFields || {};
    options.xhrFields.withCredentials = true;

    return getCsrfToken().then(function (token) {

      // Set the CSRF token, making sure that any other beforeSend methods are
      // honored.
      var _beforeSend = options.beforeSend;
      options.beforeSend = function (xhr) {
        xhr.setRequestHeader("X-CSRF-Token", token);
        if (_beforeSend) {
          _beforeSend(xhr);
        }
      };

      return _sync(method, model, options);
    });
  };

  /**
   * Returns the CSRF token.
   *
   * @return {jQuery.Deferred}
   *   A jQuery promise that will resolve the token.
   */
  function getCsrfToken () {
    var self = this;

    if (!getCsrfToken.token) {
      return Backbone.$.ajax({
        url: Backbone.Drupal.appRoot + '/user/token',
        type: 'POST',
        contentType: 'application/json',
        xhrFields: {withCredentials: true}
      })
      .then(function (data) {
        setCsrfToken(data.token);
        return data.token;
      })
      .promise();
    }

    return Backbone.$.Deferred().resolve(getCsrfToken.token).promise();
  }

  /**
   * Sets the CSRF token.
   *
   * @param {token} token
   *   The CSRF token.
   */
  function setCsrfToken (token) {
    getCsrfToken.token = token;
  }

  /**
   * Resets the CSRF token.
   */
  function resetCsrfToken () {
    getCsrfToken.token = false;
  }

})(Backbone, _);

