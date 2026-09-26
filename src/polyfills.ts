import { ensureBufferSubarray } from './bufferCompatibility';
import 'react-native-get-random-values';
import { Buffer } from 'buffer';

// Dependencies such as Anchor read Buffer during module initialization.
// Keep this in a side-effect import so it runs before App's imports.
globalThis.Buffer = globalThis.Buffer || Buffer;

ensureBufferSubarray(Buffer);
