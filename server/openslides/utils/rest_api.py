from collections import OrderedDict
from typing import Any, Dict, Iterable, Type

from django.db.models import Model
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import APIException, NotFound, ValidationError
from rest_framework.metadata import SimpleMetadata
from rest_framework.mixins import (
    CreateModelMixin as _CreateModelMixin,
    DestroyModelMixin as _DestroyModelMixin,
    UpdateModelMixin as _UpdateModelMixin,
)
from rest_framework.relations import MANY_RELATION_KWARGS
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.routers import DefaultRouter
from rest_framework.serializers import (
    BooleanField,
    CharField,
    DecimalField,
    DictField,
    Field,
    FileField,
    IntegerField,
    JSONField,
    ListField,
    ListSerializer,
    ManyRelatedField,
    ModelSerializer as _ModelSerializer,
    PrimaryKeyRelatedField,
    RelatedField,
    Serializer,
    SerializerMetaclass,
    SerializerMethodField,
)
from rest_framework.utils.serializer_helpers import ReturnDict
from rest_framework.viewsets import GenericViewSet as _GenericViewSet

from . import logging


__all__ = [
    "APIException",
    "action",
    "DecimalField",
    "SimpleMetadata",
    "DestroyModelMixin",
    "CharField",
    "DictField",
    "BooleanField",
    "FileField",
    "IntegerField",
    "JSONField",
    "ListField",
    "ListSerializer",
    "status",
    "RelatedField",
    "SerializerMethodField",
    "ValidationError",
    "NotFound",
]


router = DefaultRouter()
error_logger = logging.getLogger("openslides.requests.errors")


class IdManyRelatedField(ManyRelatedField):
    """
    ManyRelatedField that appends an suffix to the sub-fields.

    Only works together with the IdPrimaryKeyRelatedField and our
    ModelSerializer.
    """

    field_name_suffix = "_id"

    def bind(self, field_name: str, parent: Any) -> None:
        """
        Called when the field is bound to the serializer.

        See IdPrimaryKeyRelatedField for more informations.
        """
        self.source = field_name[: -len(self.field_name_suffix)]
        super().bind(field_name, parent)


class IdPrimaryKeyRelatedField(PrimaryKeyRelatedField):
    """
    Field, that renames the field name to FIELD_NAME_id.

    Only works together the our ModelSerializer.
    """

    field_name_suffix = "_id"

    def bind(self, field_name: str, parent: Any) -> None:
        """
        Called when the field is bound to the serializer.

        Changes the source so that the original field name is used (removes
        the _id suffix).
        """
        if field_name:
            # field_name is an empty string when the field is created with the
            # attribute many=True. In this case the suffix is added with the
            # IdManyRelatedField class.
            self.source = field_name[: -len(self.field_name_suffix)]
        super().bind(field_name, parent)

    @classmethod
    def many_init(cls, *args: Any, **kwargs: Any) -> IdManyRelatedField:
        """
        Method from rest_framework.relations.RelatedField That uses our
        IdManyRelatedField class instead of
        rest_framework.relations.ManyRelatedField class.
        """
        list_kwargs = {"child_relation": cls(*args, **kwargs)}
        for key in kwargs.keys():
            if key in MANY_RELATION_KWARGS:
                list_kwargs[key] = kwargs[key]
        return IdManyRelatedField(**list_kwargs)


class ErrorLoggingMixin:
    def handle_exception(self, exc: Any) -> Response:
        user_id = self.request.user.pk or 0  # type: ignore
        path = self.request._request.get_full_path()  # type: ignore
        prefix = f"{path} {user_id}"
        if isinstance(exc, APIException):
            detail = self._detail_to_string(exc.detail)
            error_logger.warning(f"{prefix} {str(detail)}")
        else:
            error_logger.warning(f"{prefix} unknown exception: {exc}")
        return super().handle_exception(exc)  # type: ignore

    def _detail_to_string(self, detail: Any) -> Any:
        if isinstance(detail, list):
            return [self._detail_to_string(item) for item in detail]
        elif isinstance(detail, dict):
            return {key: self._detail_to_string(value) for key, value in detail.items()}
        else:
            return str(detail)


class PermissionMixin:
    """
    Mixin for subclasses of APIView like GenericViewSet.

    The method check_view_permissions is evaluated. If it returns False
    self.permission_denied() is called. Django REST Framework's permission
    system is disabled.

    Also connects container to handle access permissions for model and
    viewset.
    """

    def get_permissions(self) -> Iterable[str]:
        """
        Overridden method to check view permissions. Returns an empty
        iterable so Django REST framework won't do any other permission
        checks by evaluating Django REST framework style permission classes
        and the request passes.
        """
        if not self.check_view_permissions():
            self.permission_denied(self.request)  # type: ignore
        return ()

    def check_view_permissions(self) -> bool:
        """
        Override this and return True if the requesting user should be able to
        get access to your view.

        Don't forget to use access permissions container for list and retrieve
        requests.
        """
        return False

    def get_serializer_class(self) -> Type[Serializer]:
        """
        Overridden method to return the serializer class for the model.
        """
        model = self.get_queryset().model  # type: ignore
        try:
            return model_serializer_classes[model]
        except AttributeError:
            # If there is no known serializer class for the model, return the
            # default serializer class.
            return super().get_serializer_class()  # type: ignore


model_serializer_classes: Dict[Type[Model], Serializer] = {}


class ModelSerializerRegisterer(SerializerMetaclass):
    """
    Meta class for model serializer that detects the corresponding model
    and saves it.
    """

    def __new__(cls, name, bases, attrs):  # type: ignore
        """
        Detects the corresponding model from the ModelSerializer by
        looking into the Meta-class.

        Does nothing, if the Meta-class does not have the model attribute.
        """
        serializer_class = super().__new__(cls, name, bases, attrs)
        try:
            model = serializer_class.Meta.model
        except AttributeError:
            pass
        else:
            if model_serializer_classes.get(model) is not None:
                error = (
                    f"Model {model} is already used for the serializer class "
                    f"{model_serializer_classes[model]} and cannot be registered "
                    f"for serializer class {serializer_class}."
                )
                raise RuntimeError(error)
            model_serializer_classes[model] = serializer_class
        return serializer_class


class ModelSerializer(_ModelSerializer, metaclass=ModelSerializerRegisterer):
    """
    ModelSerializer that changes the field names of related fields to
    FIELD_NAME_id.
    """

    serializer_related_field = IdPrimaryKeyRelatedField

    def get_fields(self) -> Any:
        """
        Returns all fields of the serializer.
        """
        fields: Dict[str, Field] = OrderedDict()

        for field_name, field in super().get_fields().items():
            try:
                field_name += field.field_name_suffix
            except AttributeError:
                pass
            fields[field_name] = field
        return fields


class CreateModelMixin(_CreateModelMixin):
    """
    Mixin to override create requests.
    """

    def create(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        """
        Just remove all response data (except 'id') so nobody may get
        unrestricted data.

        Special viewsets may override this.
        """
        response = super().create(request, *args, **kwargs)
        response.data = ReturnDict(
            id=response.data.get("id"),
            serializer=response.data.serializer,  # This kwarg is not send to the client.
        )
        return response


class UpdateModelMixin(_UpdateModelMixin):
    """
    Mixin to override update requests.
    """

    def update(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        """
        Just remove all response data so nobody may get unrestricted data.

        Special viewsets may override this.
        """
        response = super().update(request, *args, **kwargs)
        response.data = None
        return response


class DestroyModelMixin(_DestroyModelMixin):
    pass


class GenericViewSet(ErrorLoggingMixin, PermissionMixin, _GenericViewSet):
    pass


class ModelViewSet(
    ErrorLoggingMixin,
    PermissionMixin,
    CreateModelMixin,
    UpdateModelMixin,
    DestroyModelMixin,
    _GenericViewSet,
):
    pass
