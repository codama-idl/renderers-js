import { addToRenderMap, deleteDirectory, mapRenderMapContentAsync, writeRenderMap } from '@codama/renderers-core';
import { rootNodeVisitor, visit } from '@codama/visitors-core';

import { fragment, getCodeFormatter, RenderOptions, syncPackageJson } from '../utils';
import { getRenderMapVisitor } from './getRenderMapVisitor';

export function renderVisitor(path: string, options: RenderOptions = {}) {
    return rootNodeVisitor(async root => {
        // Delete existing generated folder.
        if (options.deleteFolderBeforeRendering ?? true) {
            deleteDirectory(path);
        }

        // Render the new files.
        let renderMap = visit(root, getRenderMapVisitor(options));

        // Format the code, if requested.
        const formatCode = await getCodeFormatter(options);
        renderMap = await mapRenderMapContentAsync(renderMap, formatCode);

        // Create or update package.json dependencies, if requested.
        await syncPackageJson(renderMap, formatCode, options);

        if (options.formatCode ?? true) {
            // If we formatted the generated code, prettierignore it
            // This avoids conflicts between the prettier version used here
            // and in the package using the generated code.
            renderMap = addToRenderMap(renderMap, '.prettierignore', fragment`**\n`);
        }

        // Write the rendered files to the output directory.
        writeRenderMap(renderMap, path);
    });
}
