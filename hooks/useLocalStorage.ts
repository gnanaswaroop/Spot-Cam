/**
 * @file Implements a custom React hook for synchronizing state with the browser's localStorage.
 */

import { useState } from 'react';

// Define a constant for the maximum number of photos to store in the gallery.
const MAX_PHOTOS = 12;

/**
 * A custom React hook that syncs state to localStorage.
 * It provides a state value and a setter function, similar to `useState`,
 * but persists the value in localStorage across browser sessions.
 * It also includes logic to cap the number of items if the stored value is an array.
 * @template T The type of the value to be stored.
 * @param {string} key The key to use for storing the value in localStorage.
 * @param {T} initialValue The initial value to use if no value is found in localStorage.
 * @returns {[T, (value: T | ((val: T) => T)) => void]} A tuple containing the stored value and a function to update it.
 */
export function useLocalStorage<T,>(key: string, initialValue: T): [T, (value: T | ((val: T) => T)) => void] {
  // Initialize state from localStorage or with the initialValue.
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      // Attempt to get the item from localStorage.
      const item = window.localStorage.getItem(key);
      // Parse the stored JSON, or return the initial value if it doesn't exist.
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      // If an error occurs (e.g., parsing error), log it and return the initial value.
      console.error(error);
      return initialValue;
    }
  });

  /**
   * A wrapper around the state setter that also updates localStorage.
   * @param {T | ((val: T) => T)} value The new value or a function that returns the new value.
   */
  const setValue = (value: T | ((val: T) => T)) => {
    try {
      // Determine the value to store, allowing for a function to be passed (like in useState).
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      
      // If the value is an array and it exceeds the maximum allowed length, trim it.
      if (Array.isArray(valueToStore) && valueToStore.length > MAX_PHOTOS) {
          // Remove the oldest items from the beginning of the array.
          valueToStore.splice(0, valueToStore.length - MAX_PHOTOS);
      }

      // Update the component's state.
      setStoredValue(valueToStore);
      // Persist the new value to localStorage.
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      // Log any errors that occur during the process.
      console.error(error);
    }
  };

  return [storedValue, setValue];
}
