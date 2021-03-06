define([
    "hr/utils",
    "hr/dom",
    "hr/hr",

    "models/command",
    "models/tab",

    "collections/tabs",

    "utils/keyboard",
    "utils/contextmenu",

    "views/grid",
    "views/tabs/tab",
    "views/tabs/base",
    "views/tabs/section"
], function(_, $, hr, Command, Tab , Tabs, Keyboard, ContextMenu, GridView, TabView, TabPanelView, TabsSectionView) {
    // Complete tabs system
    var TabsView = hr.View.extend({
        className: "cb-tabs",
        events: {
            
        },
        layouts: {
            "Auto Grid": 0,
            "Columns: 1": 1,
            "Columns: 2": 2,
            "Columns: 3": 3,
            "Columns: 4": 4
        },

        // Constructor
        initialize: function(options) {
            var that = this;
            TabsView.__super__.initialize.apply(this, arguments);

            // Current layout
            this.layout = null; // null: mode auto
            this.grid = new GridView({}, this);
            this.grid.$el.appendTo(this.$el);

            // Commands
            this.layoutCommand = new Command({}, {
                'type': "menu",
                'title': "Layout"
            });
            _.each(this.layouts, function(layout, layoutName) {
                var command = new Command({}, {
                    'type': "action",
                    'title': layoutName,
                    'action': function() {
                        that.setLayout(layout);
                    }
                });
                this.layoutCommand.menu.add(command);
                this.on("layout", function(_layout) {
                    command.toggleFlag("active", layout == _layout);
                });
            }, this);

            // Tabs collection
            this.tabs = new Tabs();

            // Restorer
            this.restorer = {};

            // Set base layout
            this.setLayout(null);
            return this;
        },

        // Return a tab by its id
        getById: function(id) {
            return this.tabs.getById(id);
        },

        // Return a section by its id
        getSection: function(id) {
            var s = _.find(this.grid.views, function(section) {
                return section.sectionId == id;
            });

            if (!s) {
                s = new TabsSectionView({
                    sectionId: id
                }, this);
                this.grid.addView(s);
            }

            return s;
        },

        // Remove a section
        removeSection: function(id) {
            var s = this.getSection(id);
            this.grid.removeView(s);
            return this;
        },

        // Render all tabs
        render: function() {
            return this.ready();
        },

        /*
         *  Add a tab
         *  @V : view class
         *  @constructor : contructor options
         *  @options : options
         */
        add: function(V, construct, options) {
            var tab = null;

            options = _.defaults(options || {}, {
                // Tab type
                type: "unknown",

                // Don't trigger event
                silent: false,

                // Open after creation
                open: true,

                // Base title
                title: "untitled",

                // Unique id for this tab
                uniqueId: null,

                // Base section id
                section: 0
            });

            if (options.uniqueId) {
                tab = this.tabs.getById(options.uniqueId)
            } else {
                options.uniqueId = _.uniqueId("tab");
            }

            if (!tab) {
                tab = new Tab({
                    'manager': this
                }, {
                    'type': options.type,
                    'id': options.uniqueId,
                    'title': options.title
                });

                // Create tab object
                this.tabs.add(tab);

                // Create content view
                tab.view = new V(_.extend(construct || {}, {
                    "tab": tab,
                }), this);
                tab.view.update();

                // Add to section
                this.getSection(options.section).addTab(tab);
            }

            if (options.open) tab.active();
            this.saveTabs();

            return tab.view;
        },

        // Open default new tab
        openDefault: function(e) {
            this.trigger("tabs:opennew");
        },

        // Define tabs layout
        setLayout: function(l) {
            this.grid.setLayout(l);
            this.trigger("layout", l);
            this.update();
        },

        // Check sections
        // -> check that there is no empty sections
        checkSections: function() {
            _.each(this.grid.views, function(section) {
                // If empty remove it
                if (section.tabs.size() == 0) {
                    this.grid.removeView(section);
                    return;
                }

                // If no active tab
                if (section.tabs.getActive() == null) {
                    section.tabs.first().active();
                }
                
            }, this);

            this.saveTabs();
        },

        // Change tab section
        changeTabSection: function(tab, section, options) {
            if (_.isString(tab)) tab = this.tabs.getById(tab);
            if (!tab) return false;

            section = this.getSection(section);

            // Remove from old section
            tab.section.remove(tab);

            // Add to new section
            section.addTab(tab, options);

            // Active
            tab.active();

            // Check sections to remove empty one
            this.checkSections();

            return true;
        },

        // Save tabs
        saveTabs: function() {
            var state = {};

            // Snapshot sections and tabs
            state.sections = _.map(this.grid.views, function(section) {
                return {
                    'id': section.sectionId,
                    'tabs':section.tabs.map(function(tab) {
                        return tab.snapshot();
                    })
                };
            });

            // Snapshot layout
            state.layout = this.grid.columns;

            hr.Storage.set("tabs", state);
        },

        // Add a restorer for tabs
        addRestorer: function(type, handler) {
            this.restorer[type] = handler;
            return this;
        },

        // Load tabs saved in last session (return number of tabs restored)
        restoreTabs: function(state) {
            var n = 0, that = this;

            state = state || hr.Storage.get("tabs");

            // Set layout
            this.setLayout(state.layout);

            // Restore tabs
            return Q.all(
                _.chain(state.sections || [])
                .map(function(section) {
                    if (section.tabs.length > 0) that.getSection(section.id);
                    return section.tabs;
                })
                .flatten()
                .map(function(tab) {
                    // Restore tab
                    return Q()
                    .then(function() {
                        if (!that.restorer[tab.type]) return;

                        return Q(that.restorer[tab.type](tab));
                    })
                    .then(function(_tab) {
                        if (!_tab) return;

                        // restore in right section
                        _tab.changeSection(tab.section);
                        n = n + 1;
                    })
                    .fin(function() {
                        return Q();
                    })
                })
                .value()
            )
            .then(function() {
                return n;
            });
        }
    }, {
        Panel: TabPanelView
    });

    // Register as a template component
    hr.View.Template.registerComponent("component.tabs", TabsView);

    return TabsView;
});