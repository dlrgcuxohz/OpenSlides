import { BaseModel } from '../base.model';

/**
 * Representation of a motion change recommendation.
 * @ignore
 */
export class MotionChangeReco extends BaseModel {
    protected _collectionString: string;
    public id: number;
    public motion_version_id: number;
    public rejected: boolean;
    public type: number;
    public other_description: string;
    public line_from: number;
    public line_to: number;
    public text: string;
    public creation_time: string;

    public constructor(
        id?: number,
        motion_version_id?: number,
        rejected?: boolean,
        type?: number,
        other_description?: string,
        line_from?: number,
        line_to?: number,
        text?: string,
        creation_time?: string
    ) {
        super();
        this._collectionString = 'motions/motion-change-recommendation';
        this.id = id;
        this.motion_version_id = motion_version_id;
        this.rejected = rejected;
        this.type = type;
        this.other_description = other_description;
        this.line_from = line_from;
        this.line_to = line_to;
        this.text = text;
        this.creation_time = creation_time;
    }
}

BaseModel.registerCollectionElement('motions/motion-change-recommendation', MotionChangeReco);
