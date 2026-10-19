/**
 * Web entry: mounts the shared React Native app through react-native-web.
 * Registering with AppRegistry (instead of a bare createRoot) lets RNW inject
 * its base stylesheet and root view, matching native layout semantics.
 */
import {AppRegistry} from 'react-native';

import App from '../../src/app/App';

const APP_NAME = 'PaisaFlow';

AppRegistry.registerComponent(APP_NAME, () => App);
AppRegistry.runApplication(APP_NAME, {
  rootTag: document.getElementById('root'),
});
