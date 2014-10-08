(function() {
  'use strict';

  var fs = require('fs'),
      path = require('path'),
      FileUtils = require('../file/file.js').File,
      cheerio = require('cheerio');

  function _replaceStyle(content) {
    return content
      .replace(new RegExp('\n{/([a-z-]*)}', 'ig'), '</p>')
      .replace(new RegExp('[^&]{!/|{([a-z-]*)}\n', 'ig'), '<p class="content-$1">')
      .replace(new RegExp('{/([a-z-]*)}', 'ig'), '</span>')
      .replace(new RegExp('[^&]{!/|{([a-z-]*)}', 'ig'), '<span class="content-$1">');
  }

  function _translateHTML(html, translation) {
    return html.replace(new RegExp('&amp;{(.*?)}', 'g'), function(match, value) {
      return translation[value];
    });
  }

  function _applyStyles($element, json) {
    for (var key in json) {
      var value = json[key];

      if (key == 'area') {
        $element.css({
          top: value.y1,
          left: value.x1,
          height: value.y2 - value.y1,
          width: value.x2 - value.x1
        });
      }
      else {
        $element.css(key, value);
      }
    }
  }

  var Card = function(file, templatePath, name) {
    if (!file || !templatePath) {
      throw new Error('A file and a template are required.');
    }

    var _name = name,
        _languageFiles = {},
        _languages = {},
        _readmeFile = null,
        _cardConfig = null,
        _templateFilePath = templatePath.substring(templatePath.indexOf('templates/') + 'templates/'.length);

    function _loadCard(templateData, card, onLoadComplete) {
      var cardType = _cardConfig.type,
          imageFile = templatePath + '/' + _templateFilePath + '-' + cardType.replace(/\s+/g, '-').toLowerCase() + '.jpg';

      fs.exists(imageFile, function(exists) {
        if (exists) {
          fs.readFile(path.join(__dirname, 'card.html'), 'utf8', function (err, data) {
            if (err) {
              onLoadComplete(err, null);
              return;
            }

            var cards = [],
                $ = cheerio.load(data),
                $container = $('.card-container'),
                $image = $('.card-image'),
                $content = $('.card-content'),
                cardCode = null,
                width = 3485, // TODO get image width
                height = 5195; // TODO get image height

            $container.css({
              width: width,
              height: height
            });

            $image.append($('<image src="' + imageFile + '"></span>'));

            for (var key in templateData) {
              var values = templateData[key];

              if (key == 'default') {
                _applyStyles($container, values);
              }
              else {
                var className = '';

                if (key.indexOf('type-') === 0) {
                  className = 'content content-' + cardType;
                  if (key.split('-')[1] != cardType) {
                    continue;
                  }
                }
                else if (key == 'text-style') {
                  var style = '<style type="text/css">';

                  for (var styleKey in values) {
                    if (styleKey == 'default') {
                      style += '.content{\n';
                    }
                    else {
                      style += '.content-' + styleKey + '{\n';
                    }

                    for (var styleValue in values[styleKey]) {
                      style += styleValue + ': ' + values[styleKey][styleValue] + ';\n';
                    }

                    style += '}';
                  }
                  $('head').append(style + '</style>');
                  continue;
                }
                else {
                  className = key;
                }

                var $element = $('<span class="' + className + '"></span>');
                _applyStyles($element, values);
                $content.append($element);
              }
            }

            $content.find('.brand').html('MemoryOverflow');

            for (var key in _cardConfig) {
              var content = _replaceStyle(_cardConfig[key]);

              if (key == 'title') {
                $content.find('.title').html(content);
              }
              else if (key == 'edition') {
                $content.find('.edition').append('<span>' + content + ' - ' + content.substring(0, 1).toUpperCase() + '</span>');
              }
              else if (key.indexOf('code') === 0) {

                cardCode = key.split(':')[1];

                _cardConfig.codes = _cardConfig.codes || [];
                _cardConfig.codes.push(cardCode);

                $content.find('.content').html(content);

                cards.push({
                  html: $.html(),
                  name: card,
                  code: cardCode
                });

              }
              else if (key == 'content') {
                $content.find('.content').html(content);

                cards.push({
                  html: $.html(),
                  name: card,
                  code: null
                });

              }

            }

            var _cards = [];

            // translate content
            cards.forEach(function(card) {
              var html = card.html;

              Object.keys(_languageFiles).forEach(function(lang) {

                var _card = {
                  html : _translateHTML(html, _languageFiles[lang]),
                  name: card.name,
                  code: card.code,
                  lang: lang
                };
                _cards.push(_card);

              });

            });

            onLoadComplete(null, _cards);

          });
        }
        else {
          throw new Error(imageFile + ' does not exist');
        }
      });

    }

    this.load = function(onLoadComplete) {
      var splitFile = file.split('/'),
          card = splitFile[splitFile.length -1].replace('.md', '');

      fs.readFile(templatePath + '/' + _templateFilePath + '.json', 'utf8', function (err, data) {
        if (err) {
          onLoadComplete(err, null);
          return;
        }

        var templateData = JSON.parse(data);

        fs.readFile(file, 'utf8', function (err, data) {
          if (err) {
            onLoadComplete(err, null);
            return;
          }

          _cardConfig = FileUtils.parseMarkdown(data);
          _cardConfig.name = _name;

          if (_cardConfig.type) {
            _getLanguageContent(function() {
              _loadCard(templateData, card, onLoadComplete);
            });
          }
          else {
            throw new Error('no type in card: ' + card);
          }

        });

      });

    };

    this.languageFiles = function(language, file) {
      if (typeof language != 'undefined' && typeof file != 'undefined') {
        _languages[language] = file;
      }

      return _languages;
    };

    var _numberLanguagesToParse = 0;

    function _getLanguageContent(callback) {
      if (_languages) {
        callback = callback || false;

        _numberLanguagesToParse = Object.keys(_languages).length;

        if (_numberLanguagesToParse === 0) {
          throw new Error('No language files for card: ' + file);
        }

        for (var language in _languages) {
          _parseLanguage(language, _languages[language], callback);
        }
      }
    }

    function _parseLanguage(language, file, callback) {

      fs.readFile(file, 'utf8', function (err, data) {
        if (err) {
          throw err;
        }

        var parsedContent = {};
        _languages[language] = FileUtils.parsePo(data);

        // need to pre-parse the content
        for (var key in _languages[language]) {
          parsedContent[_replaceStyle(key)] = _replaceStyle(_languages[language][key]);
        }

        _languageFiles[language] = parsedContent;

        _numberLanguagesToParse --;
        if (_numberLanguagesToParse === 0 && callback) {
          callback();
        }

      });
    }

    this.config = function() {
      return _cardConfig;
    };

    this.readmeFile = function(readmeFile) {
      if (typeof readmeFile != 'undefined') {
        _readmeFile = readmeFile;
      }
      return _readmeFile;
    };

  };

  exports.Card = Card;

})();