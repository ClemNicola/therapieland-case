from rest_framework import exceptions, parsers


class JSONParser(parsers.JSONParser):
    """DRF's JSON parser, plus: deeply nested JSON is a 400, not a 500 (RecursionError).

    The body size is capped by Django's DATA_UPLOAD_MAX_MEMORY_SIZE.
    """

    def parse(self, stream, media_type=None, parser_context=None):
        try:
            return super().parse(stream, media_type, parser_context)
        except RecursionError:
            raise exceptions.ParseError() from None
