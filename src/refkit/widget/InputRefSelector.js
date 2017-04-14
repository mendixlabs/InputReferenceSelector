define([
    "dojo/_base/declare",
    "mxui/widget/_WidgetBase",
    "dijit/_TemplatedMixin",
    "dijit/_FocusMixin",

    "mxui/dom",
    "dojo/dom",
    "dojo/_base/array",
    "dojo/_base/lang",
    "dojo/_base/html",
    "dojo/dom-construct",
    "dojo/dom-class",

    "mendix/lib/MxContext",
    "dijit/form/ComboBox",

    "refkit/lib/XPathSource",
    "dojo/text!refkit/templates/InputReferenceSelector.html"
], function (declare, _WidgetBase, _TemplatedMixin, _FocusMixin, dom, dojoDom, dojoArray, lang, dojoHtml, dojoConstruct, domClass, MendixContext, ComboBox, XPathSource, template) {

    "use strict";

    var MxContext = MendixContext || mendix.lib.MxContext;

    // Declare widget.
    return declare("refkit.widget.InputRefSelector", [ _WidgetBase, _TemplatedMixin, _FocusMixin ], {

        // Template path
        templateString: template,

        // Set by Modeler
        objreference : "",
        objattribute : "",
        constraints  : "",
        suggestions  : 5,
        fetchmethod  : "contains", // you want to have default for this
        autocomplete : true,
        onchangemf   : "",
        notfoundmf   : "",
        searchdelay  : 300,
        searchempty  : true,
        searchEmptyOnFocus : false,
        sortattrs    : "",
        sortorder    : "",
        placeholderText: "",

        // Internal
        sourceObject   : null,
        referredEntity : "",
        currentValue   : "",
        currentConstr  : "",

        sortParams     : null,
        xpathSource    : null,
        comboBox       : null,

        ignoreChange   : false,
        isInactive     : false,

        _handles: null,

        // dojo.declare.constructor is called to construct the widget instance. Implement to initialize non-primitive properties.
        constructor: function() {
            this._handles = [];
        },

        postCreate : function() {
            logger.debug(this.id + ".postCreate");

            this.sortParams = [];
            dojoArray.forEach(this.ignored1, lang.hitch(this, function (sortParam) {
                this.sortParams.push([ sortParam.sortattrs, sortParam.sortorder ]);
            }));

            mendix.lang.sequence([
                lang.hitch(this, this.actParseConfig),
                lang.hitch(this, this.actSetupSource),
                lang.hitch(this, this.actSetupInput)
            ]);
        },

        update : function(obj, callback) {
            logger.debug(this.id + ".update");

            if (obj) {

                var cs = this.constraints,
                    constr = this.currentConstr = cs ? this.matchTokens(cs, obj.getGuid()) : "";

                if (constr !== cs) {
                    // update constraints
                    this.xpathSource.updateConstraints(constr);
                }

                mx.data.get({
                    guid     : obj.getGuid(),
                    callback : lang.hitch(this, this.setSourceObject)
                }, this);
            } else {
                this.setSourceObject(null);
            }

            this._executeCallback(callback, "update");
        },

        actParseConfig : function(callback) {
            logger.debug(this.id + ".parseConfig");
            var splits    = this.objreference.split("/"),
                sortAttrs = this.sortattrs.split(";"),
                sortOrder = this.sortorder.split(";");

            this.name           = splits[0];
            this.objreference   = splits[0];
            this.referredEntity = splits[1];

            for (var i = 0, attr; attr = sortAttrs[i]; i++) {
                this.sortParams.push([attr, sortOrder[i]]);
            }

            this._executeCallback(callback, "parseConfig");
        },

        actSetupSource : function(callback) {
            logger.debug(this.id + ".actSetupSource");

            this.xpathSource = new XPathSource({
                caller      : this.id,
                limit       : this.suggestions,
                entity      : this.referredEntity,
                attribute   : this.objattribute,
                constraints : this.constraints,
                fetchmethod : this.fetchmethod,
                searchempty : this.searchempty,
                sortorder   : this.sortParams
            });

            this._executeCallback(callback, "actSetupSource");
        },

        actSetupInput : function(callback) {
            logger.debug(this.id + ".actSetupInput");

            if (!this.comboBox) {
                this.comboBox = new ComboBox({
                    store        : this.xpathSource,
                    queryExpr    : "${0}",
                    searchAttr   : this.objattribute,
                    searchDelay  : this.searchdelay,
                    tabIndex     : 0,
                    hasDownArrow : false,
                    autoComplete : this.autocomplete
                });
            }

            this.domNode.appendChild(this.comboBox.domNode);

            dojo.connect(this.comboBox, "onChange", this.valueChange.bind(this));
            dojo.connect(this.comboBox, "onFocus", this._onFocusCombo.bind(this));

            this.comboBox.domNode.removeAttribute("tabIndex");
            // set placeholder
            var inputEl = this.comboBox.domNode.querySelector("input.dijitInputInner");
            inputEl.placeholder = this.placeholderText;

            this._executeCallback(callback, "actSetupInput");
        },

        _onFocusCombo: function (evt) {
            if (this.searchEmptyOnFocus && this.comboBox.value === "") {
                this.comboBox._startSearchAll();
            }
        },

        setSourceObject : function(obj) {
            logger.debug(this.id + ".setSourceObject", obj ? obj.getGuid() : null);

            this.sourceObject = obj;

            if (this._handles) {
                dojoArray.forEach(this._handles, lang.hitch(this, function (handle) {
                    this.unsubscribe(handle);
                }));
                this._handles = [];
            }

            if (obj) {
                if (!this.isInactive) {
                    this.comboBox.attr("disabled", false);
                }

                var objectHandle = this.subscribe({
                    guid: obj.getGuid(),
                    callback: lang.hitch(this, this.changeReceived)
                });

                var validationHandle = this.subscribe({
                    guid: obj.getGuid(),
                    val: true,
                    callback: lang.hitch(this, this._handleValidation)
                });

                this._handles = [ objectHandle, validationHandle ];
                this.getReferredObject(obj.get(this.objreference));
            } else {
                this.comboBox.attr("disabled", true);
            }
        },

        objectUpdateNotification : function() {
            logger.debug(this.id + ".objectUpdateNotification");
            this.getReferredObject(this.sourceObject.get(this.objreference));
        },

        changeReceived : function(guid, attr, value) {
            logger.debug(this.id + ".changeReceived, change: ");
            if (!this.ignoreChange) {
                this.getReferredObject(value);
            }
        },

        getReferredObject : function(guid) {
            logger.debug(this.id + ".getReferredObject", guid);
            this.currentValue = guid;
            if (guid) {
                mx.data.get({
                    guid     : guid,
                    callback : lang.hitch(this, function(obj) {
                        logger.debug(this.id + ".getReferredObject.callback", obj);
                        if (obj.isEnum(this.objattribute)){
                            this.setDisplayValue(obj.getEnumCaption(this.objattribute));
                        } else {
                            this.setDisplayValue(obj.get(this.objattribute));
                        }
                    })
                }, this);
            } else {
                this.setDisplayValue("");
            }
        },

        setDisplayValue : function(value) {
            logger.debug(this.id + ".setDisplayValue", value);
            this.ignoreChange = true;
            this._clearValidations();

            if (this.comboBox) {
                this.comboBox.attr("value", value);
            }

            setTimeout(lang.hitch(this, function() {
                this.ignoreChange = false;
            }), 10);
        },

        _onFocus: function () {
            domClass.add(this.domNode, "MxClient_Focus");
        },

        _onBlur: function () {
            domClass.remove(this.domNode, "MxClient_Focus");
        },

        valueChange : function(value, target) {
            logger.debug(this.id + ".valueChange", value, target);
            if (!this.ignoreChange) {
                this.ignoreChange = true;
                this.getGuid(lang.hitch(this, function(guid) {
                    if (guid === "" && this.notfoundmf !== "") {
                        mx.data.create({
                            entity: this.referredEntity,
                            callback : function (obj) {
                                obj.set(this.objattribute, value);
                                obj.save({ callback : function () {}});
                                this.sourceObject.addReference(this.objreference, obj.getGuid());
                                this.sourceObject.save({
                                    callback : function () {
                                        this.ignoreChange = false;
                                        this.executeMF(this.notfoundmf);
                                    }.bind(this)
                                });
                            }.bind(this),
                            error    : function () {
                                // Error
                            },
                            context  : null
                        });
                    } else if (guid !== this.currentValue) {
                        this.sourceObject.set(this.objreference, this.currentValue = guid);
                        this.ignoreChange = false;
                        this.executeMF(this.onchangemf);
                    }
                }));
            }
        },

        resize: function () {},

        executeMF : function (mf) {
            logger.debug(this.id + ".executeMF", mf);
            if (mf) {
                var context = new MxContext();

                var params = {
                    applyto: "selection",
                    context: context,
                    guids: []
                };

                if (this.sourceObject) {
                    context.setContext(this.sourceObject.getEntity(), this.sourceObject.getGuid());
                    params.guids = [this.sourceObject.getGuid()];
                }

                mx.ui.action(mf, {
                    params: params,
                    callback   : lang.hitch(this, function() {
                        logger.debug(this.id + ".executeMF.OK");
                    }),
                    error      : lang.hitch(this, function() {
                        logger.debug(this.id + ".executeMF.error");
                    })
                });
            }
        },

        // TODO: Recheck in 3.0
        matchTokens : function(str, mendixguid){
            logger.debug(this.id + ".matchTokens", arguments);
            var newstr = "";
            if (str !== null && str !== "") {
                newstr = str.match(/\[%CurrentObject%\]/) !== null ? str.replace(/\[%CurrentObject%\]/g, mendixguid) : str;
            }
            return newstr;
        },

        // TODO: use xpath from source
        getGuid : function(callback) {
            logger.debug(this.id + ".getGuid");

            var value = this.comboBox.attr("value"),
                item  = this.comboBox.item;

            if (item) { // we already have an object
                callback(item.getGuid());
            } else if (value !== "") { // find an object that meets our requirements
                var attr   = this.objattribute,
                method = this.fetchmethod === "startswith" ? "starts-with" : this.fetchmethod,
                constr = "[" + method + "(" + attr + ",'" + value + "')";

                constr += method === "starts-with" ? " or " + attr + "='" + value + "']" : "]";

                var xpath = "//" + this.referredEntity + this.currentConstr + constr;

                mx.data.get({
                    xpath  : xpath,
                    filter : {
                        limit : 2 // then we know if there is more than one object meeting the constraint
                    },
                    callback : function(objs) {
                        if (objs.length === 1) {
                            callback(objs[0].getGuid());
                        } else {
                            logger.warn(this.id + ".onBlur: There is more than one object found, so change is ignored");
                            this.setDisplayValue("");
                            callback("");
                        }
                    },
                    error : function() {
                        // error
                    }
                }, this);
            } else {
                callback("");
            }
        },

        _setDisabledAttr : function(value) {
            logger.debug(this.id + "._setDisabledAttr");
            this.isInactive = !!value;
            this.comboBox.attr("disabled", this.isInactive);
        },

        _handleValidation: function(validations) {
            logger.debug(this.id + "._handleValidation");
            this._clearValidations();

            var validation = validations[0],
                message = validation.getReasonByAttribute(this.objreference);

            if (this.readOnly) {
                validation.removeAttribute(this.objreference);
            } else if (message) {
                this._addValidation(message);
                validation.removeAttribute(this.objreference);
            }
        },

        _clearValidations: function() {
            logger.debug(this.id + "._clearValidations");
            domClass.toggle(this.domNode, "has-error", false);
            dojoConstruct.destroy(this._alertDiv);
            this._alertDiv = null;
        },

        _showError: function(message) {
            logger.debug(this.id + "._showError");
            if (this._alertDiv !== null) {
                dojoHtml.set(this._alertDiv, message);
                return true;
            }
            this._alertDiv = dojoConstruct.create("div", {
                "class": "alert alert-danger",
                "innerHTML": message
            });
            dojoConstruct.place(this._alertDiv, this.domNode);
            domClass.toggle(this.domNode, "has-error", true);
        },

        _addValidation: function(message) {
            logger.debug(this.id + "._addValidation");
            this._showError(message);
        },

        _executeCallback: function (cb, from) {
            logger.debug(this.id + "._executeCallback" + (from ? " from: " + from : ""));
            if (cb && typeof cb === "function") {
              cb();
            }
        },

        uninitialize : function() {
            logger.debug(this.id + ".uninitialize");
            this.comboBox.destroyRecursive();
        }

    });
});

require(["refkit/widget/InputRefSelector"]);
