/*global chrome*/
import $ from 'jquery';
import axios from 'axios';

import {ACTIONS, EXTENSION_META_BUTTON_SELECTOR_NAME, MESSAGE_TYPES, TASKS} from './helpers/contants';
import {
  getGnosisSafeAddress,
  handleSharedEvents,
  isAragonIframe, isGnosisSafeTab,
  isTopFrame,
  openPopUp, togglePopUp
} from './helpers/contentScripts';
import {makeBackgroundRequest} from './helpers/routines';

const startObservingDOM = callback => {
  const MutationObserver = window.MutationObserver || window.WebKitMutationObserver;
  const observer = new MutationObserver(function(mutations, observer) {
    // fired callback when mutation happens
    if(callback && typeof callback === 'function') {
      callback();
    }
  });

  // define element to observer and types of mutations
  observer.observe(document, {
    subtree: true,
    attributes: true,
  });

  return observer;
};

if(isAragonIframe()) {
  $(document).ready(() => {
    const injectAragonMetaButton = (delay=500) => {
      setTimeout(() => {
        const voteDescriptionContainer = $('[class^="VoteDescription___"]');
        const metaButtonSelector = `#${EXTENSION_META_BUTTON_SELECTOR_NAME}`;
        const metaButton = voteDescriptionContainer.find(metaButtonSelector);
        if(!metaButton.length) {
          const addressButtons = voteDescriptionContainer.find('[class^="DetailedDescription___"] button[class^="BadgeBase___"]');
          if(addressButtons.length) {
            const batchAddress = addressButtons.attr('title');
            if(batchAddress) {
              voteDescriptionContainer.append(`
                    <button id="${EXTENSION_META_BUTTON_SELECTOR_NAME}" 
                            style="padding: 8px;color: #fff;margin: 16px 0;background-color: #000;border: 1px solid #000;border-radius: 5px;cursor: pointer;">
                      View Details with Grindery
                    </button>
                  `);
              $(metaButtonSelector).click(() => {
                makeBackgroundRequest(TASKS.OPEN_META_POPUP, {
                  url: window.location.href,
                  query: batchAddress
                }).catch(e => {
                  console.error('gMeta iframe:error', e);
                });
              });
            }
          }
        }
      }, delay);
    };

    injectAragonMetaButton();

    startObservingDOM(injectAragonMetaButton);
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const sendSuccessResponse = data => {
    sendResponse({
      data,
    });
  };

  if(message && message.type === MESSAGE_TYPES.ACTION && isTopFrame()) {
    const action = message && message.action || null,
      payload = message && message.payload || null;

    switch (action) {
      case ACTIONS.OPEN_META_POPUP: {
        const {query} = payload || {};
        openPopUp();
        if(query) {
          setTimeout(() => {
            makeBackgroundRequest(TASKS.RELAY_META_EVENT, {
              query,
            }).catch(e => {
              console.error('gMeta iframe:error', e);
            });
          }, 200);
        }
        sendSuccessResponse({message: 'received'});
        break;
      }
      case ACTIONS.TOGGLE_META_POPUP: {
        togglePopUp();
        sendSuccessResponse({message: 'received'});
        break;
      }
      case ACTIONS.ADD_META: {
        if(isGnosisSafeTab()) {
          const isTransactionsPage = () => /^\/app\//i.test(window.location.pathname) && /\/transactions\/(queue|history)/i.test(window.location.pathname);

          if(isTransactionsPage()) {
            const safeAddress = getGnosisSafeAddress();
            if(safeAddress) {
              const {networkId} = payload || {};

              const injectGnosisMetaButtons = () => {
                const scrollContainer = $('#infinite-scroll-container');
                const transactionRows = scrollContainer.find('.MuiPaper-root.MuiAccordion-root > .MuiButtonBase-root.MuiAccordionSummary-root:first-child');
                const transactionInfoContainers = transactionRows.find('.tx-info');

                const metaButtonSelector = `.${EXTENSION_META_BUTTON_SELECTOR_NAME}`;
                const metaButtons = scrollContainer.find(metaButtonSelector);

                if(isTransactionsPage() && transactionInfoContainers.length && transactionInfoContainers.length > metaButtons.length) {
                  const view = /\/queue/i.test(window.location.pathname)?'queued':'history';
                  axios.get(
                    `https://safe-client.gnosis.io/v1/chains/${networkId || '4'}/safes/${safeAddress}/transactions/${view}/`
                  ).then(res => {
                    const { results } = res && res.data;
                    if(results && Array.isArray(results) && results.length) {
                      const transactions = (results || []).filter(i => i.type === 'TRANSACTION' && i.transaction).map(i => i.transaction);
                      if(transactions.length) {
                        for (const [idx, elem] of transactionInfoContainers.toArray().entries()) {
                          const txInfoContainer = $(elem);
                          const transaction = transactions[idx];
                          if(transaction && transaction.id) {
                            const [type, address, safeTxHash] = (transaction.id || '').split('_');
                            if(!txInfoContainer.find(`.${EXTENSION_META_BUTTON_SELECTOR_NAME}`).length) {
                              if(type === 'multisig' && safeTxHash) {
                                txInfoContainer.append(`
                                <button class="${EXTENSION_META_BUTTON_SELECTOR_NAME}" 
                                        data-safe-tx-hash="${safeTxHash}"
                                        style="display: inline-block; color: #fff;padding: 4px 8px;margin-left: 4px;background-color: #000;border: 1px solid #000;border-radius: 5px;cursor: pointer;">
                                  View Details with Grindery
                                </button>
                              `);
                                $(metaButtonSelector).click(function () {
                                  const hash = $(this).attr('data-safe-tx-hash');
                                  makeBackgroundRequest(TASKS.OPEN_META_POPUP, {
                                    url: window.location.href,
                                    query: hash,
                                  }).catch(e => {
                                    console.error('add meta: gnosis:error', e);
                                  });
                                });
                              } else {
                                txInfoContainer.append(`<span class="${EXTENSION_META_BUTTON_SELECTOR_NAME}"></span>`);
                              }
                            }
                          }
                        }
                      }
                    }
                  }).catch(() => {
                  });
                }

              };

              injectGnosisMetaButtons();
              startObservingDOM(injectGnosisMetaButtons);
            }
          }
        }
        break;
      }
      default: {
        handleSharedEvents(message, sender, sendResponse);
        break;
      }
    }
  }
});