globalThis.window = globalThis; await import(process.argv[2]); console.log(window.__kern().join('\n'));
