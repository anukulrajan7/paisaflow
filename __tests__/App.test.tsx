/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

// Bootstrap touches native nitro-sqlite; replace it with a no-op so the
// render test stays hermetic. The gate then renders its LoadingState.
jest.mock('../src/app/bootstrap/bootstrap', () => ({
  runBootstrap: jest.fn(() => Promise.resolve()),
}));

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
