export interface TrimmerConfig {
    /**
    * The Redis streams to trimmer events off.
    * @REQUIRED
    */
    streams: string[];

    /**
    * The consumer group to associate with the trimmer.
    * @REQUIRED
    */
    group: string;

    /**
    * The unique identifier for the trimmer.
    * @OPTIONAL
    * 
    * If not provided, a default client ID in the format `rivulex:${group}:trimmer:${Date.now()}` will be used.
    * @default `rivulex:${group}:trimmer:${Date.now()}`
    * 
    */
    clientId?: string;

    /**
     * The retention period for events in the stream, in milliseconds.
     * @OPTIONAL
     * This defines how long events should be retained in the stream before being trimmed.
     * If not provided, a default value will need to be set by the implementation.
     *
     * @default 172_800_000 (48h)
     * @minimum 10_000 (10s)
     */
    retentionPeriod?: number;

    /**
     * The interval time between trim operations, in seconds.
     * @OPTIONAL
     * This defines how frequently the trimmer should check and trim the stream.
     * If not provided, a default value will need to be set by the implementation.
     * 
     * @default 172_800_000 (48h)
     * @minimum 10_000 (10s)
     */
    intervalTime?: number;
}