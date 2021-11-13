/**
 * Image transforms
 */
export class SpeedyPipelineTransformFactory extends SpeedyNamespace {
    /**
     * Resize image
     * @param {string} [name]
     * @returns {SpeedyPipelineNodeResize}
     */
    static Resize(name?: string): SpeedyPipelineNodeResize;
    /**
     * Warp an image using a perspective transformation
     * @param {string} [name]
     * @returns {SpeedyPipelineNodePerspectiveWarp}
     */
    static PerspectiveWarp(name?: string): SpeedyPipelineNodePerspectiveWarp;
}
import { SpeedyNamespace } from "../../speedy-namespace";
import { SpeedyPipelineNodeResize } from "../nodes/transforms/resize";
import { SpeedyPipelineNodePerspectiveWarp } from "../nodes/transforms/perspective-warp";
//# sourceMappingURL=transform-factory.d.ts.map