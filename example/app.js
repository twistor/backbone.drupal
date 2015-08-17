/**
 * @file
 * Sample app code for backbone.drupal.js.
 */

var session = new Backbone.Drupal.Model.Session();

var app = new Marionette.Application();

app.addRegions({
  mainRegion: "#content"
});

app.addInitializer(function (options) {
  var nodesView = new NodesView({
    collection: options.nodes
  });
  app.mainRegion.show(nodesView);
});

NodeView = Marionette.ItemView.extend({
  template: "#node-template",
  tagName: 'tr',
  className: 'node',

  ui: {
    title: '.title'
  },

  events: {
    'click a.save': 'updateTitle',
    'loggedIn': 'updateState'
  },

  updateTitle: function () {
    var self = this;

    var title = this.ui.title.val();
    this.model.set('title', title);
    this.model.save().done(function () {
      self.model.fetch().done(function () {
        $('#messages').text('Node title updated.').slideDown('slow').delay(1500).slideUp('slow');
      });
    });
  },

  updateState: function () {
    this.ui.title.prop('disabled', false);
  }
});

NodesView = Marionette.CompositeView.extend({
  id: "nodes",
  template: "#nodes-template",
  childView: NodeView,
  childViewContainer: "tbody",

  initialize: function () {
    this.listenTo(this.collection, "sort", this.renderCollection);
  },

  appendHtml: function (collectionView, itemView) {
    collectionView.$("tbody").append(itemView.el);
  }
});

var nodelist;

$(document).ready(function() {

  session.login(username, password).done(function () {
    nodelist = new Backbone.Drupal.Collection.Node();

    nodelist.fetch({remove: false}).done(function () {
      nodelist.each(function (model) {
        model.fetch();
      });
    });

    app.start({nodes: nodelist});
  });
});
