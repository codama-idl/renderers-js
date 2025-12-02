import { deleteDirectory, writeRenderMap } from '@codama/renderers-core';
import { rootNodeVisitor, visit } from '@codama/visitors-core';

import { formatCode, RenderOptions, syncPackageJson } from '../utils';
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
        renderMap = await formatCode(renderMap, options);

        // Create or update package.json dependencies, if requested.
        syncPackageJson(renderMap, options);

        // Write the rendered files to the output directory.
        writeRenderMap(renderMap, path);
    });
}
